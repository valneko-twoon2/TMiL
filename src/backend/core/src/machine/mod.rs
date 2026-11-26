//! バックエンドの状態機械。
//!
//! 画面の表示・終了・計測・タスク マネージャーの置き換え・プロセス終了の「判断」をここに集める。
//! 状態は純粋関数 [`step`] だけで変わり、実際の処理（計測やプロセス終了）は [`Effect`] として
//! 呼び出し側（`backend.rs`）が実行する。
//!
//! TLA+ の `tests/formal/BackendMachine.tla` の `Step` と 1 対 1 に対応する。
//! 変えたときの手順は docs/architecture/state-machine.md を参照。

use std::fmt;

use crate::model::KillTarget;

#[cfg(test)]
pub(crate) mod tla;

/// ウィンドウの表示状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Window {
    Visible,
    Hidden,
}

/// アプリの生死。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Life {
    Running,
    Quitting,
}

/// タスク マネージャー置き換えについて、最後に確かめた状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Registry {
    /// まだ確かめていない
    Unknown,
    /// 置き換えていない
    NotReplaced,
    /// TMiL に置き換わっている
    Replaced,
    /// 別のアプリに置き換わっている
    Other,
}

/// 置き換えの切り替えを実行中か。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Pending {
    Idle,
    Enable,
    Disable,
}

impl Pending {
    /// 切り替えが成功したときにあるべき状態。
    pub fn target(self) -> Option<Registry> {
        match self {
            Self::Idle => None,
            Self::Enable => Some(Registry::Replaced),
            Self::Disable => Some(Registry::NotReplaced),
        }
    }
}

/// 状態機械の状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct State {
    pub window: Window,
    pub life: Life,
    /// 計測中か（計測は同時に 1 つだけ）
    pub sampling: bool,
    /// 直前の計測結果を持っているか
    pub cached: bool,
    pub registry: Registry,
    pub pending: Pending,
}

impl State {
    /// 起動直後の状態。
    pub const INITIAL: Self = Self {
        window: Window::Visible,
        life: Life::Running,
        sampling: false,
        cached: false,
        registry: Registry::Unknown,
        pending: Pending::Idle,
    };
}

impl Default for State {
    fn default() -> Self {
        Self::INITIAL
    }
}

/// 終了しようとしているプロセスの、今の様子。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ObservedProcess {
    /// 今その PID で動いているプロセスの起動時刻
    pub start_time: u64,
    /// TMiL 自身か、その子孫（WebView など）か
    pub protected: bool,
}

/// 状態機械に伝える出来事。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    WindowShown,
    WindowHidden,
    QuitRequested,
    /// 計測結果がほしい。`stale` は前回の計測から最小間隔以上たったか
    SnapshotRequested {
        stale: bool,
    },
    SampleFinished,
    /// 置き換えの状態を確かめた
    ReplacementObserved(Registry),
    ReplacementRequested {
        enable: bool,
    },
    /// 管理者として切り替えを試み終え、改めて状態を確かめた
    ElevationFinished(Registry),
    /// プロセスの終了を頼まれた。`observed` は今その PID で動いているプロセス
    KillRequested {
        target: KillTarget,
        observed: Option<ObservedProcess>,
    },
}

/// 断った理由。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rejection {
    Hidden,
    Busy,
    Quitting,
    NotFound,
    Protected,
    Replaced,
}

impl fmt::Display for Rejection {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Hidden => "ウィンドウが隠れている間は計測しません。",
            Self::Busy => "前の処理が終わっていません。少し待ってからやり直してください。",
            Self::Quitting => "終了処理中です。",
            Self::NotFound => "プロセスが見つかりません。すでに終了している可能性があります。",
            Self::Protected => {
                "TMiL 自身と、TMiL の画面を表示しているプロセスは終了できません。TMiL を終了するときはトレイのメニューを使ってください。"
            }
            Self::Replaced => "プロセスが入れ替わっています。一覧を更新してからやり直してください。",
        })
    }
}

/// 状態が変わったあとに、呼び出し側が行うこと。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    /// 何もしない（状態だけ変わる）
    Nothing,
    /// 計測する。終わったら [`Event::SampleFinished`] を伝える
    Sample,
    /// 直前の計測結果を返す
    ServeCached,
    /// 画面に表示状態を知らせる
    EmitVisibility(bool),
    /// アプリを終了する
    Exit,
    /// 管理者として切り替えを試みる。終わったら [`Event::ElevationFinished`] を伝える
    StartElevation {
        enable: bool,
    },
    ReplacementSucceeded,
    ReplacementFailed,
    /// この PID のプロセスを終了する
    Kill(u32),
    Reject(Rejection),
}

/// 遷移の結果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Transition {
    pub state: State,
    pub effect: Effect,
}

const fn to(state: State, effect: Effect) -> Transition {
    Transition { state, effect }
}

fn snapshot_step(s: State, stale: bool) -> Transition {
    let serve_or = |reason| {
        to(
            s,
            if s.cached {
                Effect::ServeCached
            } else {
                Effect::Reject(reason)
            },
        )
    };
    if s.life == Life::Quitting {
        to(s, Effect::Reject(Rejection::Quitting))
    } else if s.sampling {
        serve_or(Rejection::Busy)
    } else if s.window == Window::Hidden {
        serve_or(Rejection::Hidden)
    } else if s.cached && !stale {
        to(s, Effect::ServeCached)
    } else {
        to(
            State {
                sampling: true,
                ..s
            },
            Effect::Sample,
        )
    }
}

fn replacement_request_step(s: State, enable: bool) -> Transition {
    if s.life == Life::Quitting {
        to(s, Effect::Reject(Rejection::Quitting))
    } else if s.pending != Pending::Idle {
        to(s, Effect::Reject(Rejection::Busy))
    } else {
        let pending = if enable {
            Pending::Enable
        } else {
            Pending::Disable
        };
        to(State { pending, ..s }, Effect::StartElevation { enable })
    }
}

fn kill_step(s: State, target: KillTarget, observed: Option<ObservedProcess>) -> Transition {
    let reject = |r| to(s, Effect::Reject(r));
    match observed {
        _ if s.life == Life::Quitting => reject(Rejection::Quitting),
        None => reject(Rejection::NotFound),
        Some(p) if p.protected => reject(Rejection::Protected),
        Some(p) if p.start_time != target.start_time => reject(Rejection::Replaced),
        Some(_) => to(s, Effect::Kill(target.pid)),
    }
}

/// 出来事を 1 つ受けて、次の状態と行うことを決める。受け付けない出来事なら `None`。
pub fn step(s: State, event: &Event) -> Option<Transition> {
    match *event {
        Event::WindowShown => (s.window == Window::Hidden).then_some(Transition {
            state: State {
                window: Window::Visible,
                ..s
            },
            effect: Effect::EmitVisibility(true),
        }),
        Event::WindowHidden => (s.window == Window::Visible).then_some(Transition {
            state: State {
                window: Window::Hidden,
                ..s
            },
            effect: Effect::EmitVisibility(false),
        }),
        Event::QuitRequested => (s.life == Life::Running).then_some(Transition {
            state: State {
                life: Life::Quitting,
                ..s
            },
            effect: Effect::Exit,
        }),
        Event::SnapshotRequested { stale } => Some(snapshot_step(s, stale)),
        Event::SampleFinished => s.sampling.then_some(Transition {
            state: State {
                sampling: false,
                cached: true,
                ..s
            },
            effect: Effect::Nothing,
        }),
        Event::ReplacementObserved(registry) => {
            (s.pending == Pending::Idle && registry != Registry::Unknown).then_some(Transition {
                state: State { registry, ..s },
                effect: Effect::Nothing,
            })
        }
        Event::ReplacementRequested { enable } => Some(replacement_request_step(s, enable)),
        Event::ElevationFinished(registry) => {
            let target = s.pending.target()?;
            (registry != Registry::Unknown).then_some(Transition {
                state: State {
                    registry,
                    pending: Pending::Idle,
                    ..s
                },
                effect: if registry == target {
                    Effect::ReplacementSucceeded
                } else {
                    Effect::ReplacementFailed
                },
            })
        }
        Event::KillRequested { target, observed } => Some(kill_step(s, target, observed)),
    }
}

/// 状態を持ち、出来事を順に受け取る。
#[derive(Debug, Clone, Default)]
pub struct Machine {
    state: State,
}

impl Machine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn state(&self) -> State {
        self.state
    }

    /// 出来事を伝え、行うことを返す。受け付けない出来事なら状態は変えず `None`。
    pub fn dispatch(&mut self, event: &Event) -> Option<Effect> {
        let t = step(self.state, event)?;
        self.state = t.state;
        Some(t.effect)
    }
}

#[cfg(test)]
mod tests;
