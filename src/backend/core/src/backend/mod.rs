use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use crate::collector::{Collector, CollectorError};
use crate::machine::{Effect, Event, ProcessAction, Registry, State};
use crate::model::{
    KillResult, KillTarget, Priority, ProcessControls, ProcessDetails, ReplacementStatus, Snapshot,
    SystemInfo, process_details,
};
use crate::process_control;
use machine_lock::MachineLock;

/// 前回の計測からこれより短い間隔の依頼には、計測し直さず直前の結果を返す。
/// （短すぎると CPU 使用率や転送量の計算が不安定になる）
pub const MIN_SAMPLE_INTERVAL: Duration = Duration::from_millis(400);

const POISONED: &str = "内部状態が壊れました。アプリを再起動してください。";

fn lock<T>(m: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    m.lock().map_err(|_| POISONED.to_owned())
}

mod machine_lock {
    use std::sync::Mutex;

    use super::lock;
    use crate::machine::{Effect, Event, Machine, State};

    /// ロックを外に渡さず、状態機械の 1 歩の間だけ持つ。持ったままほかのロックを待てないので、
    /// collector を持ってから machine を取る順番が崩れない。
    #[derive(Debug)]
    pub(super) struct MachineLock(Mutex<Machine>);

    impl MachineLock {
        pub(super) fn new() -> Self {
            Self(Mutex::new(Machine::new()))
        }

        pub(super) fn state(&self) -> Result<State, String> {
            Ok(lock(&self.0)?.state())
        }

        pub(super) fn dispatch(&self, event: &Event) -> Result<Option<Effect>, String> {
            Ok(lock(&self.0)?.dispatch(event))
        }
    }
}

pub fn registry_of(status: &ReplacementStatus) -> Registry {
    if status.replaced {
        Registry::Replaced
    } else if status.other.is_some() {
        Registry::Other
    } else {
        Registry::NotReplaced
    }
}

pub fn is_stale(last_sample: Option<Instant>, now: Instant) -> bool {
    last_sample.is_none_or(|at| now.saturating_duration_since(at) >= MIN_SAMPLE_INTERVAL)
}

type Outcome = Result<(), String>;

fn kill_result(pid: u32, outcome: Outcome) -> KillResult {
    KillResult {
        pid,
        ok: outcome.is_ok(),
        error: outcome.err(),
    }
}

#[derive(Debug)]
pub struct Backend {
    machine: MachineLock,
    collector: Mutex<Collector>,
    cache: Mutex<Option<(Instant, Snapshot)>>,
}

impl Backend {
    pub fn new() -> Result<Self, CollectorError> {
        Ok(Self::with_collector(Collector::new()?))
    }

    pub fn with_collector(collector: Collector) -> Self {
        Self {
            machine: MachineLock::new(),
            collector: Mutex::new(collector),
            cache: Mutex::new(None),
        }
    }

    pub fn state(&self) -> Result<State, String> {
        self.machine.state()
    }

    fn dispatch(&self, event: &Event) -> Result<Option<Effect>, String> {
        self.machine.dispatch(event)
    }

    fn cached(&self) -> Result<Snapshot, String> {
        lock(&self.cache)?
            .as_ref()
            .map(|(_, s)| s.clone())
            .ok_or_else(|| "まだ計測結果がありません。".to_owned())
    }

    pub fn snapshot(&self) -> Result<Snapshot, String> {
        let stale = is_stale(
            lock(&self.cache)?.as_ref().map(|(at, _)| *at),
            Instant::now(),
        );
        match self.dispatch(&Event::SnapshotRequested { stale })? {
            Some(Effect::Sample) => {
                let sampled = lock(&self.collector).map(|mut c| c.snapshot());
                let saved = sampled.as_ref().is_ok_and(|snap| {
                    lock(&self.cache).is_ok_and(|mut cache| {
                        *cache = Some((Instant::now(), snap.clone()));
                        true
                    })
                });
                self.dispatch(&Event::SampleFinished { ok: saved })?;
                sampled
            }
            Some(Effect::ServeCached) => self.cached(),
            Some(Effect::Reject(r)) => Err(r.to_string()),
            other => Err(format!("想定しない処理です: {other:?}")),
        }
    }

    pub fn process_details(&self, pids: &[u32]) -> Result<Vec<ProcessDetails>, String> {
        Ok(lock(&self.cache)?
            .as_ref()
            .map(|(_, s)| process_details(&s.processes, pids))
            .unwrap_or_default())
    }

    pub fn system_info(&self) -> Result<SystemInfo, String> {
        Ok(lock(&self.collector)?.system_info())
    }

    pub fn kill(&self, targets: &[KillTarget]) -> Result<Vec<KillResult>, String> {
        let results: Vec<KillResult> = self
            .decide(targets, ProcessAction::Kill, |collector, pid| {
                if collector.terminate(pid) {
                    Ok(())
                } else {
                    Err("終了できませんでした。権限が足りない可能性があります。".to_owned())
                }
            })?
            .into_iter()
            .map(|(pid, outcome)| kill_result(pid, outcome))
            .collect();
        let killed: Vec<u32> = results.iter().filter(|r| r.ok).map(|r| r.pid).collect();
        if !killed.is_empty()
            && let Some((_, snap)) = lock(&self.cache)?.as_mut()
        {
            snap.processes.retain(|p| !killed.contains(&p.pid));
            snap.cpu.process_count = snap.processes.len();
        }
        Ok(results)
    }

    pub fn set_priority(
        &self,
        targets: &[KillTarget],
        priority: Priority,
    ) -> Result<Vec<KillResult>, String> {
        self.act(targets, ProcessAction::SetPriority(priority), |pid| {
            process_control::set_priority(pid, priority)
        })
    }

    pub fn set_affinity(
        &self,
        targets: &[KillTarget],
        cpus: &[u32],
    ) -> Result<Vec<KillResult>, String> {
        let mask = process_control::mask_from_cpus(cpus)?;
        self.act(targets, ProcessAction::SetAffinity(mask), |pid| {
            process_control::set_affinity(pid, mask)
        })
    }

    pub fn suspend(&self, targets: &[KillTarget]) -> Result<Vec<KillResult>, String> {
        self.act(targets, ProcessAction::Suspend, |pid| {
            process_control::suspend(pid)
        })
    }

    pub fn resume(&self, targets: &[KillTarget]) -> Result<Vec<KillResult>, String> {
        self.act(targets, ProcessAction::Resume, |pid| {
            process_control::resume(pid)
        })
    }

    pub fn set_efficiency(
        &self,
        targets: &[KillTarget],
        on: bool,
    ) -> Result<Vec<KillResult>, String> {
        self.act(targets, ProcessAction::SetEfficiency(on), |pid| {
            process_control::set_efficiency(pid, on)
        })
    }

    fn act(
        &self,
        targets: &[KillTarget],
        action: ProcessAction,
        apply: impl Fn(u32) -> Outcome,
    ) -> Result<Vec<KillResult>, String> {
        Ok(self
            .decide(targets, action, |_, _| Ok(()))?
            .into_iter()
            .map(|(pid, approved)| kill_result(pid, approved.and_then(|()| apply(pid))))
            .collect())
    }

    fn decide(
        &self,
        targets: &[KillTarget],
        action: ProcessAction,
        while_locked: impl Fn(&Collector, u32) -> Outcome,
    ) -> Result<Vec<(u32, Outcome)>, String> {
        let mut collector = lock(&self.collector)?;
        collector.refresh_process_list();
        targets
            .iter()
            .map(|&target| {
                let observed = collector.observe(target.pid);
                let outcome = match self.dispatch(&Event::ProcessActionRequested {
                    target,
                    observed,
                    action,
                })? {
                    Some(Effect::Act { pid, .. }) => while_locked(&collector, pid),
                    Some(Effect::Reject(r)) => Err(r.to_string()),
                    other => Err(format!("想定しない処理です: {other:?}")),
                };
                Ok((target.pid, outcome))
            })
            .collect()
    }

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

    pub fn replacement_status(
        &self,
        observe: impl FnOnce() -> ReplacementStatus,
    ) -> Result<ReplacementStatus, String> {
        let status = observe();
        if status.supported {
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
