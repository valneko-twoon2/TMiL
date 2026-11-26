//! TLA+ との突き合わせ用（テスト専用）。
//! 全状態・全出来事を列挙し、TLA+ の値の書き方に変えて遷移表（MachineTable.tla）を作る。

use std::fmt::Write as _;

use super::{
    Effect, Event, Life, ObservedProcess, Pending, Registry, Rejection, State, Window, step,
};
use crate::model::KillTarget;

const WINDOWS: [Window; 2] = [Window::Visible, Window::Hidden];
const LIVES: [Life; 2] = [Life::Running, Life::Quitting];
pub(crate) const REGISTRIES: [Registry; 4] = [
    Registry::Unknown,
    Registry::NotReplaced,
    Registry::Replaced,
    Registry::Other,
];
const PENDINGS: [Pending; 3] = [Pending::Idle, Pending::Enable, Pending::Disable];
const BOOLS: [bool; 2] = [false, true];

/// 終了の判断を調べるときに使う、決まった対象。
pub(crate) const KILL_TARGET: KillTarget = KillTarget {
    pid: 42,
    start_time: 100,
};

/// TLA+ 側の出来事と、それに当たる Rust の出来事の組。
#[derive(Debug, Clone)]
pub(crate) struct AbstractEvent {
    pub(crate) tla: String,
    pub(crate) event: Event,
}

/// 全状態（192 通り）。並びは遷移表の番号になる。
pub(crate) fn all_states() -> Vec<State> {
    let mut out = Vec::new();
    for window in WINDOWS {
        for life in LIVES {
            for sampling in BOOLS {
                for cached in BOOLS {
                    for registry in REGISTRIES {
                        for pending in PENDINGS {
                            out.push(State {
                                window,
                                life,
                                sampling,
                                cached,
                                registry,
                                pending,
                            });
                        }
                    }
                }
            }
        }
    }
    out
}

fn tla_bool(b: bool) -> &'static str {
    if b { "TRUE" } else { "FALSE" }
}

pub(crate) fn registry_tla(r: Registry) -> &'static str {
    match r {
        Registry::Unknown => "unknown",
        Registry::NotReplaced => "none",
        Registry::Replaced => "tmil",
        Registry::Other => "other",
    }
}

fn simple(kind: &str, event: Event) -> AbstractEvent {
    AbstractEvent {
        tla: format!(r#"[kind |-> "{kind}"]"#),
        event,
    }
}

/// 全出来事（24 通り）。プロセス終了は「存在するか・守るべきか・起動時刻が同じか」で分ける。
pub(crate) fn all_events() -> Vec<AbstractEvent> {
    let mut out = vec![
        simple("windowShown", Event::WindowShown),
        simple("windowHidden", Event::WindowHidden),
        simple("quitRequested", Event::QuitRequested),
        simple("sampleFinished", Event::SampleFinished),
    ];
    for stale in BOOLS {
        out.push(AbstractEvent {
            tla: format!(
                r#"[kind |-> "snapshotRequested", stale |-> {}]"#,
                tla_bool(stale)
            ),
            event: Event::SnapshotRequested { stale },
        });
    }
    for r in REGISTRIES {
        out.push(AbstractEvent {
            tla: format!(
                r#"[kind |-> "replacementObserved", registry |-> "{}"]"#,
                registry_tla(r)
            ),
            event: Event::ReplacementObserved(r),
        });
    }
    for r in REGISTRIES {
        out.push(AbstractEvent {
            tla: format!(
                r#"[kind |-> "elevationFinished", registry |-> "{}"]"#,
                registry_tla(r)
            ),
            event: Event::ElevationFinished(r),
        });
    }
    for enable in BOOLS {
        out.push(AbstractEvent {
            tla: format!(
                r#"[kind |-> "replacementRequested", enable |-> {}]"#,
                tla_bool(enable)
            ),
            event: Event::ReplacementRequested { enable },
        });
    }
    for exists in BOOLS {
        for protected in BOOLS {
            for same_start in BOOLS {
                let observed = exists.then_some(ObservedProcess {
                    start_time: if same_start {
                        KILL_TARGET.start_time
                    } else {
                        KILL_TARGET.start_time + 1
                    },
                    protected,
                });
                out.push(AbstractEvent {
                    tla: format!(
                        r#"[kind |-> "killRequested", exists |-> {}, protected |-> {}, sameStart |-> {}]"#,
                        tla_bool(exists),
                        tla_bool(protected),
                        tla_bool(same_start)
                    ),
                    event: Event::KillRequested {
                        target: KILL_TARGET,
                        observed,
                    },
                });
            }
        }
    }
    out
}

pub(crate) fn state_tla(s: State) -> String {
    let window = match s.window {
        Window::Visible => "visible",
        Window::Hidden => "hidden",
    };
    let life = match s.life {
        Life::Running => "running",
        Life::Quitting => "quitting",
    };
    let pending = match s.pending {
        Pending::Idle => "idle",
        Pending::Enable => "enable",
        Pending::Disable => "disable",
    };
    format!(
        r#"[window |-> "{window}", life |-> "{life}", sampling |-> {}, cached |-> {}, registry |-> "{}", pending |-> "{pending}"]"#,
        tla_bool(s.sampling),
        tla_bool(s.cached),
        registry_tla(s.registry)
    )
}

/// TLA+ 側の「行うこと」の名前。
pub(crate) fn effect_tla(e: Effect) -> &'static str {
    match e {
        Effect::Nothing => "nothing",
        Effect::Sample => "sample",
        Effect::ServeCached => "serveCached",
        Effect::EmitVisibility(true) => "emitShown",
        Effect::EmitVisibility(false) => "emitHidden",
        Effect::Exit => "exit",
        Effect::StartElevation { enable: true } => "startEnable",
        Effect::StartElevation { enable: false } => "startDisable",
        Effect::ReplacementSucceeded => "replacementOk",
        Effect::ReplacementFailed => "replacementFailed",
        Effect::Kill(_) => "kill",
        Effect::Reject(Rejection::Hidden) => "rejectHidden",
        Effect::Reject(Rejection::Busy) => "rejectBusy",
        Effect::Reject(Rejection::Quitting) => "rejectQuitting",
        Effect::Reject(Rejection::NotFound) => "rejectNotFound",
        Effect::Reject(Rejection::Protected) => "rejectProtected",
        Effect::Reject(Rejection::Replaced) => "rejectReplaced",
    }
}

/// 全ての「行うこと」の名前（遷移表の番号の並び）。
pub(crate) const EFFECTS: [&str; 17] = [
    "nothing",
    "sample",
    "serveCached",
    "emitShown",
    "emitHidden",
    "exit",
    "startEnable",
    "startDisable",
    "replacementOk",
    "replacementFailed",
    "kill",
    "rejectHidden",
    "rejectBusy",
    "rejectQuitting",
    "rejectNotFound",
    "rejectProtected",
    "rejectReplaced",
];

fn sequence(items: &[String]) -> String {
    let body = items
        .iter()
        .map(|i| format!("  {i}"))
        .collect::<Vec<_>>()
        .join(",\n");
    format!("<<\n{body}\n>>")
}

/// 遷移表の TLA+ モジュール全体。
pub(crate) fn render_table() -> String {
    let states = all_states();
    let events = all_events();
    let index_of_state = |s: State| states.iter().position(|x| *x == s).map_or(0, |i| i + 1);
    let index_of_effect = |e: Effect| {
        EFFECTS
            .iter()
            .position(|x| *x == effect_tla(e))
            .map_or(0, |i| i + 1)
    };

    let mut rows = Vec::new();
    for (si, s) in states.iter().enumerate() {
        for (ei, e) in events.iter().enumerate() {
            let (to, effect) = step(*s, &e.event).map_or((0, 0), |t| {
                (index_of_state(t.state), index_of_effect(t.effect))
            });
            rows.push(format!("<<{}, {}, {to}, {effect}>>", si + 1, ei + 1));
        }
    }
    let row_lines = rows
        .chunks(8)
        .map(|c| format!("  {}", c.join(", ")))
        .collect::<Vec<_>>()
        .join(",\n");

    let mut out = String::new();
    let _ = writeln!(
        out,
        "---------------------------- MODULE MachineTable ----------------------------"
    );
    let _ = writeln!(
        out,
        "\\* Generated by Rust (src/backend/core/src/machine/tla.rs). Do not edit by hand."
    );
    let _ = writeln!(
        out,
        "\\* Regenerate: UPDATE_FORMAL=1 cargo test -p tmil-core machine::tests::formal"
    );
    let _ = writeln!(
        out,
        "\\* All transitions of machine::step for every state x every event.\n"
    );
    let _ = writeln!(
        out,
        "TableStates == {}\n",
        sequence(&states.iter().map(|s| state_tla(*s)).collect::<Vec<_>>())
    );
    let _ = writeln!(
        out,
        "TableEvents == {}\n",
        sequence(&events.iter().map(|e| e.tla.clone()).collect::<Vec<_>>())
    );
    let _ = writeln!(
        out,
        "TableEffects == {}\n",
        sequence(
            &EFFECTS
                .iter()
                .map(|e| format!("\"{e}\""))
                .collect::<Vec<_>>()
        )
    );
    let _ = writeln!(
        out,
        "\\* <<from, event, to, effect>> as indexes into the sequences above (0, 0 = not applicable)"
    );
    let _ = writeln!(out, "TableRows == {{\n{row_lines}\n}}\n");
    let _ = writeln!(
        out,
        "============================================================================="
    );
    out
}
