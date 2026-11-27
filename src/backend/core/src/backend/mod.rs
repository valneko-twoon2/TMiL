//! 状態機械（[`machine`](crate::machine)）と実際の処理をつなぐ殻。
//!
//! 判断はすべて状態機械に任せ、ここでは出来事を伝えて、返ってきた [`Effect`] のとおりに
//! 計測・プロセスへの操作（終了・優先度・関係・中断・再開・効率モード）・管理者としての切り替えを行うだけにする。
//!
//! ロックの順番は「collector → machine」に固定する（machine を持ったまま collector を待たない）。
//! 計測や UAC の確認の間は machine のロックを手放すので、その間の依頼は状態機械が
//! 「直前の結果を返す」「処理中」と判断する。

use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use crate::collector::{Collector, CollectorError};
use crate::machine::{Effect, Event, Machine, ProcessAction, Registry, State};
use crate::model::{
    KillResult, KillTarget, Priority, ProcessControls, ReplacementStatus, Snapshot, SystemInfo,
};
use crate::process_control;

/// 前回の計測からこれより短い間隔の依頼には、計測し直さず直前の結果を返す。
/// （短すぎると CPU 使用率や転送量の計算が不安定になる）
pub const MIN_SAMPLE_INTERVAL: Duration = Duration::from_millis(400);

const POISONED: &str = "内部状態が壊れました。アプリを再起動してください。";

fn lock<T>(m: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    m.lock().map_err(|_| POISONED.to_owned())
}

/// 置き換えの状態を状態機械の言葉に直す。
pub fn registry_of(status: &ReplacementStatus) -> Registry {
    if status.replaced {
        Registry::Replaced
    } else if status.other.is_some() {
        Registry::Other
    } else {
        Registry::NotReplaced
    }
}

/// 状態機械に「計測が古いか」を伝えるための判定。
pub fn is_stale(last_sample: Option<Instant>, now: Instant) -> bool {
    last_sample.is_none_or(|at| now.saturating_duration_since(at) >= MIN_SAMPLE_INTERVAL)
}

/// バックエンド全体。Tauri からはこれだけを使う。
#[derive(Debug)]
pub struct Backend {
    machine: Mutex<Machine>,
    collector: Mutex<Collector>,
    cache: Mutex<Option<(Instant, Snapshot)>>,
}

impl Backend {
    pub fn new() -> Result<Self, CollectorError> {
        Ok(Self::with_collector(Collector::new()?))
    }

    pub fn with_collector(collector: Collector) -> Self {
        Self {
            machine: Mutex::new(Machine::new()),
            collector: Mutex::new(collector),
            cache: Mutex::new(None),
        }
    }

    /// 今の状態（テストと調査用）。
    pub fn state(&self) -> Result<State, String> {
        Ok(lock(&self.machine)?.state())
    }

    fn dispatch(&self, event: &Event) -> Result<Option<Effect>, String> {
        Ok(lock(&self.machine)?.dispatch(event))
    }

    fn cached(&self) -> Result<Snapshot, String> {
        lock(&self.cache)?
            .as_ref()
            .map(|(_, s)| s.clone())
            .ok_or_else(|| "まだ計測結果がありません。".to_owned())
    }

    /// 最新の計測結果。計測するか直前の結果を返すかは状態機械が決める。
    pub fn snapshot(&self) -> Result<Snapshot, String> {
        let stale = is_stale(
            lock(&self.cache)?.as_ref().map(|(at, _)| *at),
            Instant::now(),
        );
        match self.dispatch(&Event::SnapshotRequested { stale })? {
            Some(Effect::Sample) => {
                // machine のロックは手放してから計測する
                let sampled = lock(&self.collector).map(|mut c| c.snapshot());
                let saved = sampled.as_ref().is_ok_and(|snap| {
                    lock(&self.cache).is_ok_and(|mut cache| {
                        *cache = Some((Instant::now(), snap.clone()));
                        true
                    })
                });
                // 計測や保存に失敗しても「計測中」は必ず終わらせ、成否を伝える
                self.dispatch(&Event::SampleFinished { ok: saved })?;
                sampled
            }
            Some(Effect::ServeCached) => self.cached(),
            Some(Effect::Reject(r)) => Err(r.to_string()),
            other => Err(format!("想定しない処理です: {other:?}")),
        }
    }

    /// 変化しないシステム情報。
    pub fn system_info(&self) -> Result<SystemInfo, String> {
        Ok(lock(&self.collector)?.system_info())
    }

    /// プロセスを終了する。終了してよいかは 1 つずつ状態機械が決める。
    /// 終了できたプロセスは直前の結果からも除き、次の計測を待たずに一覧から消えるようにする。
    pub fn kill(&self, targets: &[KillTarget]) -> Result<Vec<KillResult>, String> {
        let results = self.act(targets, ProcessAction::Kill, |_, _| {
            Err("内部エラー: 終了は collector で行います。".to_owned())
        })?;
        let killed: Vec<u32> = results.iter().filter(|r| r.ok).map(|r| r.pid).collect();
        if !killed.is_empty()
            && let Some((_, snap)) = lock(&self.cache)?.as_mut()
        {
            snap.processes.retain(|p| !killed.contains(&p.pid));
            snap.cpu.process_count = snap.processes.len();
        }
        Ok(results)
    }

    /// プロセスの優先度を変える。変えてよいかは 1 つずつ状態機械が決める。
    pub fn set_priority(
        &self,
        targets: &[KillTarget],
        priority: Priority,
    ) -> Result<Vec<KillResult>, String> {
        self.act(targets, ProcessAction::SetPriority(priority), |pid, _| {
            process_control::set_priority(pid, priority)
        })
    }

    /// プロセスの関係（動かしてよい CPU）を変える。変えてよいかは 1 つずつ状態機械が決める。
    pub fn set_affinity(
        &self,
        targets: &[KillTarget],
        cpus: &[u32],
    ) -> Result<Vec<KillResult>, String> {
        let mask = process_control::mask_from_cpus(cpus)?;
        self.act(targets, ProcessAction::SetAffinity(mask), |pid, _| {
            process_control::set_affinity(pid, mask)
        })
    }

    /// プロセスを中断する。中断してよいかは 1 つずつ状態機械が決める。
    pub fn suspend(&self, targets: &[KillTarget]) -> Result<Vec<KillResult>, String> {
        self.act(targets, ProcessAction::Suspend, |pid, _| {
            process_control::suspend(pid)
        })
    }

    /// 中断したプロセスを再開する。
    pub fn resume(&self, targets: &[KillTarget]) -> Result<Vec<KillResult>, String> {
        self.act(targets, ProcessAction::Resume, |pid, _| {
            process_control::resume(pid)
        })
    }

    /// 効率モードを入れる・外す。
    pub fn set_efficiency(
        &self,
        targets: &[KillTarget],
        on: bool,
    ) -> Result<Vec<KillResult>, String> {
        self.act(targets, ProcessAction::SetEfficiency(on), |pid, _| {
            process_control::set_efficiency(pid, on)
        })
    }

    /// 1 つずつ状態機械に聞いてから操作する。
    /// 終了は collector のロックを持ったまま行う。ほかの操作（PowerShell などで時間がかかる）は
    /// 計測を止めないよう、判断を済ませてロックを手放してから `apply` で行う。
    fn act(
        &self,
        targets: &[KillTarget],
        action: ProcessAction,
        apply: impl Fn(u32, ProcessAction) -> Result<(), String>,
    ) -> Result<Vec<KillResult>, String> {
        let result = |pid, outcome: Result<(), String>| KillResult {
            pid,
            ok: outcome.is_ok(),
            error: outcome.err(),
        };
        let decided: Vec<(u32, Result<Option<ProcessAction>, String>)> = {
            let mut collector = lock(&self.collector)?;
            collector.refresh_process_list();
            let mut decided = Vec::with_capacity(targets.len());
            for &target in targets {
                let observed = collector.observe(target.pid);
                let effect = self.dispatch(&Event::ProcessActionRequested {
                    target,
                    observed,
                    action,
                })?;
                let outcome = match effect {
                    Some(Effect::Act {
                        pid,
                        action: ProcessAction::Kill,
                    }) => {
                        if collector.terminate(pid) {
                            Ok(None)
                        } else {
                            Err("終了できませんでした。権限が足りない可能性があります。".to_owned())
                        }
                    }
                    Some(Effect::Act { action, .. }) => Ok(Some(action)),
                    Some(Effect::Reject(r)) => Err(r.to_string()),
                    other => Err(format!("想定しない処理です: {other:?}")),
                };
                decided.push((target.pid, outcome));
            }
            decided
        };
        Ok(decided
            .into_iter()
            .map(|(pid, outcome)| match outcome {
                Ok(Some(action)) => result(pid, apply(pid, action)),
                Ok(None) => result(pid, Ok(())),
                Err(msg) => result(pid, Err(msg)),
            })
            .collect())
    }

    /// 今の優先度と関係（読むだけなので状態機械は通さない）。
    pub fn controls(pid: u32) -> ProcessControls {
        process_control::controls(pid)
    }

    /// ウィンドウを出した。画面に知らせるべきなら `true`。
    pub fn window_shown(&self) -> Result<bool, String> {
        Ok(matches!(
            self.dispatch(&Event::WindowShown)?,
            Some(Effect::EmitVisibility(true))
        ))
    }

    /// ウィンドウを隠した。画面に知らせるべきなら `true`。
    pub fn window_hidden(&self) -> Result<bool, String> {
        Ok(matches!(
            self.dispatch(&Event::WindowHidden)?,
            Some(Effect::EmitVisibility(false))
        ))
    }

    /// 終了を頼まれた。アプリを終了すべきなら `true`。
    pub fn quit(&self) -> Result<bool, String> {
        Ok(matches!(
            self.dispatch(&Event::QuitRequested)?,
            Some(Effect::Exit)
        ))
    }

    /// 置き換えの状態を確かめ、状態機械にも伝える。
    pub fn replacement_status(
        &self,
        observe: impl FnOnce() -> ReplacementStatus,
    ) -> Result<ReplacementStatus, String> {
        let status = observe();
        if status.supported {
            // 切り替え中なら状態機械は受け付けない（結果は ElevationFinished で伝わる）
            self.dispatch(&Event::ReplacementObserved(registry_of(&status)))?;
        }
        Ok(status)
    }

    /// 置き換えを切り替える。`elevate` は管理者としての書き込み（UAC の確認が出る）、
    /// `observe` は状態の確認（書き込みの前後に呼ぶ）。どちらも machine のロックを持たずに呼ぶ。
    pub fn set_replacement(
        &self,
        enable: bool,
        elevate: impl FnOnce(bool) -> Result<(), String>,
        observe: impl Fn() -> ReplacementStatus,
    ) -> Result<ReplacementStatus, String> {
        // 別のアプリが置き換えていないかを、頼む直前に確かめる（状態機械が判断する）
        self.dispatch(&Event::ReplacementObserved(registry_of(&observe())))?;
        match self.dispatch(&Event::ReplacementRequested { enable })? {
            Some(Effect::StartElevation { .. }) => {}
            Some(Effect::Reject(r)) => return Err(r.to_string()),
            other => return Err(format!("想定しない処理です: {other:?}")),
        }
        let elevated = elevate(enable);
        let status = observe();
        match self.dispatch(&Event::ElevationFinished(registry_of(&status)))? {
            Some(Effect::ReplacementSucceeded) => Ok(status),
            Some(Effect::ReplacementFailed) => Err(elevated.err().unwrap_or_else(|| {
                "設定が反映されませんでした。管理者の確認が取り消された可能性があります。"
                    .to_owned()
            })),
            other => Err(format!("想定しない処理です: {other:?}")),
        }
    }
}

/// 置き換えの切り替えを、この実行ファイルについて行う（Windows のみ）。
pub fn set_replacement_for_exe(
    backend: &Backend,
    exe: &Path,
    enable: bool,
) -> Result<ReplacementStatus, String> {
    let status = crate::taskmgr::status(exe);
    if !status.supported {
        return Err("この機能は Windows でのみ使えます。".to_owned());
    }
    backend.set_replacement(
        enable,
        |on| crate::taskmgr::elevate(exe, on),
        || crate::taskmgr::status(exe),
    )
}

#[cfg(test)]
mod tests;
