use super::tla::{self, KILL_TARGET};
use super::*;
use std::collections::{HashSet, VecDeque};

fn visible_ready() -> State {
    State {
        cached: true,
        ..State::INITIAL
    }
}

fn observed(start_time: u64, protected: bool) -> ObservedProcess {
    ObservedProcess {
        start_time,
        protected,
    }
}

fn kill(s: State, observed: Option<ObservedProcess>) -> Option<Transition> {
    step(
        s,
        &Event::ProcessActionRequested {
            target: KILL_TARGET,
            observed,
            action: ProcessAction::Kill,
        },
    )
}

mod equivalence {
    use super::*;

    #[test]
    fn hiding_and_showing_the_window_emits_visibility() {
        let hidden = step(State::INITIAL, &Event::WindowHidden).unwrap();
        assert_eq!(hidden.state.window, Window::Hidden);
        assert_eq!(hidden.effect, Effect::EmitVisibility(false));
        let shown = step(hidden.state, &Event::WindowShown).unwrap();
        assert_eq!(shown.state.window, Window::Visible);
        assert_eq!(shown.effect, Effect::EmitVisibility(true));
    }

    #[test]
    fn first_snapshot_samples_then_caches() {
        let t = step(State::INITIAL, &Event::SnapshotRequested { stale: true }).unwrap();
        assert_eq!(t.effect, Effect::Sample);
        assert!(t.state.sampling);
        let done = step(t.state, &Event::SampleFinished { ok: true }).unwrap();
        assert!(!done.state.sampling);
        assert!(done.state.cached);
    }

    #[test]
    fn stale_cache_is_resampled() {
        let t = step(visible_ready(), &Event::SnapshotRequested { stale: true }).unwrap();
        assert_eq!(t.effect, Effect::Sample);
    }

    #[test]
    fn replacement_succeeds_when_observed_state_matches() {
        let req = step(
            State::INITIAL,
            &Event::ReplacementRequested { enable: true },
        )
        .unwrap();
        assert_eq!(req.effect, Effect::StartElevation { enable: true });
        assert_eq!(req.state.pending, Pending::Enable);
        let done = step(req.state, &Event::ElevationFinished(Registry::Replaced)).unwrap();
        assert_eq!(done.effect, Effect::ReplacementSucceeded);
        assert_eq!(done.state.pending, Pending::Idle);
        assert_eq!(done.state.registry, Registry::Replaced);
    }

    #[test]
    fn disabling_succeeds_when_not_replaced() {
        let req = step(
            State::INITIAL,
            &Event::ReplacementRequested { enable: false },
        )
        .unwrap();
        let done = step(req.state, &Event::ElevationFinished(Registry::NotReplaced)).unwrap();
        assert_eq!(done.effect, Effect::ReplacementSucceeded);
    }

    #[test]
    fn observing_replacement_updates_registry() {
        let t = step(State::INITIAL, &Event::ReplacementObserved(Registry::Other)).unwrap();
        assert_eq!(t.state.registry, Registry::Other);
        assert_eq!(t.effect, Effect::Nothing);
    }

    #[test]
    fn matching_process_is_killed_by_target_pid() {
        let t = kill(
            State::INITIAL,
            Some(observed(KILL_TARGET.start_time, false)),
        )
        .unwrap();
        assert_eq!(
            t.effect,
            Effect::Act {
                pid: KILL_TARGET.pid,
                action: ProcessAction::Kill
            }
        );
        assert_eq!(t.state, State::INITIAL);
    }

    #[test]
    fn quit_moves_to_quitting_and_exits() {
        let t = step(State::INITIAL, &Event::QuitRequested).unwrap();
        assert_eq!(t.state.life, Life::Quitting);
        assert_eq!(t.effect, Effect::Exit);
    }

    #[test]
    fn machine_dispatch_keeps_state() {
        let mut m = Machine::new();
        assert_eq!(
            m.dispatch(&Event::SnapshotRequested { stale: true }),
            Some(Effect::Sample)
        );
        assert!(m.state().sampling);
        assert_eq!(m.dispatch(&Event::WindowShown), None);
        assert!(m.state().sampling, "受け付けない出来事で状態は変わらない");
    }

    #[test]
    fn rejection_messages_are_japanese() {
        for r in [
            Rejection::Hidden,
            Rejection::Busy,
            Rejection::Quitting,
            Rejection::NotFound,
            Rejection::Protected,
            Rejection::Replaced,
            Rejection::OtherTool,
        ] {
            assert!(r.to_string().ends_with('。'), "{r:?}");
        }
    }
}

mod boundary {
    use super::*;

    #[test]
    fn events_that_do_not_apply_are_ignored() {
        assert_eq!(step(State::INITIAL, &Event::WindowShown), None);
        assert_eq!(
            step(State::INITIAL, &Event::SampleFinished { ok: true }),
            None
        );
        assert_eq!(
            step(
                State::INITIAL,
                &Event::ElevationFinished(Registry::Replaced)
            ),
            None
        );
        assert_eq!(
            step(
                State::INITIAL,
                &Event::ReplacementObserved(Registry::Unknown)
            ),
            None
        );
        let quitting = step(State::INITIAL, &Event::QuitRequested).unwrap().state;
        assert_eq!(step(quitting, &Event::QuitRequested), None);
    }

    #[test]
    fn unknown_result_does_not_finish_elevation() {
        let req = step(
            State::INITIAL,
            &Event::ReplacementRequested { enable: true },
        )
        .unwrap();
        assert_eq!(
            step(req.state, &Event::ElevationFinished(Registry::Unknown)),
            None
        );
    }

    #[test]
    fn hidden_window_without_cache_rejects() {
        let hidden = State {
            window: Window::Hidden,
            ..State::INITIAL
        };
        let t = step(hidden, &Event::SnapshotRequested { stale: true }).unwrap();
        assert_eq!(t.effect, Effect::Reject(Rejection::Hidden));
    }

    #[test]
    fn sampling_without_cache_rejects_as_busy() {
        let sampling = State {
            sampling: true,
            ..State::INITIAL
        };
        let t = step(sampling, &Event::SnapshotRequested { stale: true }).unwrap();
        assert_eq!(t.effect, Effect::Reject(Rejection::Busy));
    }

    #[test]
    fn quitting_rejects_requests() {
        let quitting = State {
            life: Life::Quitting,
            cached: true,
            ..State::INITIAL
        };
        for event in [
            Event::SnapshotRequested { stale: true },
            Event::ReplacementRequested { enable: true },
            Event::ProcessActionRequested {
                target: KILL_TARGET,
                observed: Some(observed(KILL_TARGET.start_time, false)),
                action: ProcessAction::Kill,
            },
        ] {
            assert_eq!(
                step(quitting, &event).unwrap().effect,
                Effect::Reject(Rejection::Quitting),
                "{event:?}"
            );
        }
    }

    #[test]
    fn missing_process_is_not_found() {
        assert_eq!(
            kill(State::INITIAL, None).unwrap().effect,
            Effect::Reject(Rejection::NotFound)
        );
    }

    #[test]
    fn pending_target() {
        assert_eq!(Pending::Idle.target(), None);
        assert_eq!(Pending::Enable.target(), Some(Registry::Replaced));
        assert_eq!(Pending::Disable.target(), Some(Registry::NotReplaced));
    }

    #[test]
    fn observing_during_elevation_is_ignored() {
        let req = step(
            State::INITIAL,
            &Event::ReplacementRequested { enable: true },
        )
        .unwrap();
        assert_eq!(
            step(req.state, &Event::ReplacementObserved(Registry::Other)),
            None
        );
    }
}

/// これまでに直した不具合を、状態機械の判断として固定する。
mod regression {
    use super::*;

    /// 取得が重なると、計測を同時に 2 つ走らせてグラフが跳ねていた。
    #[test]
    fn second_request_while_sampling_does_not_sample_again() {
        let sampling = State {
            sampling: true,
            cached: true,
            ..State::INITIAL
        };
        let t = step(sampling, &Event::SnapshotRequested { stale: true }).unwrap();
        assert_eq!(t.effect, Effect::ServeCached);
    }

    /// 前回の計測から間もない取得でも計測し直し、転送量や CPU 使用率が跳ねていた。
    #[test]
    fn fresh_cache_is_served_instead_of_resampling() {
        let t = step(visible_ready(), &Event::SnapshotRequested { stale: false }).unwrap();
        assert_eq!(t.effect, Effect::ServeCached);
    }

    /// ウィンドウが隠れている間も計測していた（トレイ常駐中に重くなる）。
    #[test]
    fn hidden_window_does_not_sample() {
        let hidden = State {
            window: Window::Hidden,
            cached: true,
            ..State::INITIAL
        };
        let t = step(hidden, &Event::SnapshotRequested { stale: true }).unwrap();
        assert_eq!(t.effect, Effect::ServeCached);
    }

    /// UAC を取り消しても成功扱いになっていた。
    #[test]
    fn cancelled_elevation_is_reported_as_failure() {
        let req = step(
            State::INITIAL,
            &Event::ReplacementRequested { enable: true },
        )
        .unwrap();
        let done = step(req.state, &Event::ElevationFinished(Registry::NotReplaced)).unwrap();
        assert_eq!(done.effect, Effect::ReplacementFailed);
    }

    /// 切り替え中にもう一度頼むと、UAC が 2 つ出ていた。
    #[test]
    fn second_replacement_request_is_busy() {
        let req = step(
            State::INITIAL,
            &Event::ReplacementRequested { enable: true },
        )
        .unwrap();
        let again = step(req.state, &Event::ReplacementRequested { enable: false }).unwrap();
        assert_eq!(again.effect, Effect::Reject(Rejection::Busy));
        assert_eq!(again.state.pending, Pending::Enable);
    }

    /// 計測に失敗しても「直前の結果あり」になり、無い結果を返そうとしていた。
    #[test]
    fn failed_sample_does_not_mark_cache() {
        let sampling = State {
            sampling: true,
            ..State::INITIAL
        };
        let t = step(sampling, &Event::SampleFinished { ok: false }).unwrap();
        assert!(!t.state.sampling);
        assert!(!t.state.cached);
        let cached = State {
            cached: true,
            ..sampling
        };
        let t = step(cached, &Event::SampleFinished { ok: false }).unwrap();
        assert!(t.state.cached, "前の結果は残っている");
    }

    /// 別のツールの置き換えを確認なしで上書きし、「元に戻す」で消していた。
    #[test]
    fn other_tools_replacement_is_left_alone() {
        let other = State {
            registry: Registry::Other,
            ..State::INITIAL
        };
        for enable in [true, false] {
            let t = step(other, &Event::ReplacementRequested { enable }).unwrap();
            assert_eq!(t.effect, Effect::Reject(Rejection::OtherTool));
            assert_eq!(t.state.pending, Pending::Idle);
        }
    }

    /// TMiL 自身の WebView まで終了できてしまい、画面が落ちていた。
    #[test]
    fn protected_process_is_never_killed() {
        let t = kill(State::INITIAL, Some(observed(KILL_TARGET.start_time, true))).unwrap();
        assert_eq!(t.effect, Effect::Reject(Rejection::Protected));
    }

    /// PID が再利用された別のプロセスを終了しうる。
    #[test]
    fn reused_pid_is_not_killed() {
        let t = kill(
            State::INITIAL,
            Some(observed(KILL_TARGET.start_time + 1, false)),
        )
        .unwrap();
        assert_eq!(t.effect, Effect::Reject(Rejection::Replaced));
    }
}

/// TLA+ の `Backend.tla` で検査している安全性を、Rust でも全状態 × 全出来事について確かめる。
/// TLA+ との一致は遷移表（MachineTable.tla）を通して TLC が確かめる。
mod formal {
    use super::*;

    /// 1 つの遷移が守るべきこと。破っていればその名前を返す。
    fn violation(s: State, e: &Event, t: &Transition) -> Option<&'static str> {
        let running = s.life == Life::Running;
        match (t.effect, e) {
            (Effect::Sample, Event::SnapshotRequested { stale }) => {
                if s.window != Window::Visible || !running {
                    Some("隠れている・終了中なのに計測した")
                } else if s.sampling {
                    Some("計測を重ねた")
                } else if s.cached && !stale {
                    Some("間もないのに計測し直した")
                } else {
                    None
                }
            }
            (Effect::Sample, _) => Some("計測の依頼以外で計測した"),
            (
                Effect::Act { pid, action },
                Event::ProcessActionRequested {
                    target,
                    observed,
                    action: requested,
                },
            ) => match observed {
                _ if !running => Some("終了中にプロセスを終了した"),
                None => Some("存在しないプロセスを終了した"),
                Some(p) if p.protected => Some("守るべきプロセスを終了した"),
                Some(p) if p.start_time != target.start_time => {
                    Some("入れ替わったプロセスを終了した")
                }
                Some(_) if pid != target.pid => Some("頼まれていない PID を終了した"),
                Some(_) if action != *requested => Some("頼まれていない操作をした"),
                Some(_) => None,
            },
            (Effect::Act { .. }, _) => Some("操作の依頼以外でプロセスを操作した"),
            (Effect::ReplacementSucceeded, Event::ElevationFinished(observed)) => {
                (s.pending.target() != Some(*observed)).then_some("成功していないのに成功とした")
            }
            (Effect::StartElevation { .. }, _) if s.registry == Registry::Other => {
                Some("別のアプリの置き換えを書き換えた")
            }
            (Effect::StartElevation { .. }, _) => (!running || s.pending != Pending::Idle)
                .then_some("切り替えを重ねた・終了中に始めた"),
            (Effect::ServeCached, _) if !s.cached => Some("無い結果を返した"),
            _ => None,
        }
    }

    #[test]
    fn every_transition_keeps_the_safety_rules() {
        for s in tla::all_states() {
            for e in tla::all_events() {
                if let Some(t) = step(s, &e.event) {
                    assert_eq!(violation(s, &e.event, &t), None, "{s:?} / {:?}", e.event);
                }
            }
        }
    }

    #[test]
    fn transitions_never_leave_quitting() {
        for s in tla::all_states()
            .into_iter()
            .filter(|s| s.life == Life::Quitting)
        {
            for e in tla::all_events() {
                if let Some(t) = step(s, &e.event) {
                    assert_eq!(t.state.life, Life::Quitting, "{s:?} / {:?}", e.event);
                }
            }
        }
    }

    #[test]
    fn every_state_is_reachable_from_the_initial_state() {
        let events = tla::all_events();
        let mut seen = HashSet::from([State::INITIAL]);
        let mut queue = VecDeque::from([State::INITIAL]);
        while let Some(s) = queue.pop_front() {
            for e in &events {
                if let Some(t) = step(s, &e.event)
                    && seen.insert(t.state)
                {
                    queue.push_back(t.state);
                }
            }
        }
        // 別のアプリが置き換えている（other）と分かっている間は切り替えを始めないので、
        // 「other かつ切り替え中」の 32 通りにだけは届かない。それ以外の 160 通りには届く
        let unreachable: Vec<State> = tla::all_states()
            .into_iter()
            .filter(|s| !seen.contains(s))
            .collect();
        assert!(
            unreachable
                .iter()
                .all(|s| s.registry == Registry::Other && s.pending != Pending::Idle),
            "{unreachable:?}"
        );
        assert_eq!(unreachable.len(), 32);
    }

    #[test]
    fn transition_table_matches_committed_tla_module() {
        let text = tla::render_table();
        let path = crate::test_support::repo_root().join("tests/formal/MachineTable.tla");
        if std::env::var_os("UPDATE_FORMAL").is_some() {
            std::fs::write(&path, &text).unwrap();
            return;
        }
        let committed = std::fs::read_to_string(&path).unwrap_or_default();
        assert!(
            committed.replace("\r\n", "\n") == text,
            "遷移表が古いです。UPDATE_FORMAL=1 cargo test -p tmil-core machine::tests::formal で作り直し、TLA+ 側（BackendMachine.tla）も合わせてください"
        );
    }

    #[test]
    fn table_covers_every_effect_name() {
        let mut used = HashSet::new();
        for s in tla::all_states() {
            for e in tla::all_events() {
                if let Some(t) = step(s, &e.event) {
                    used.insert(tla::effect_tla(t.effect));
                }
            }
        }
        assert_eq!(used.len(), tla::EFFECTS.len(), "使われない Effect がある");
        assert!(
            tla::REGISTRIES
                .iter()
                .all(|r| !tla::registry_tla(*r).is_empty())
        );
    }

    /// TLA+ ではプロセスへの操作を終了で代表させている。その前提（判断が操作の種類によらない）を
    /// 全状態 × 観測の全組み合わせ × 全種類の操作で確かめる。
    #[test]
    fn process_decision_does_not_depend_on_action() {
        let actions = [
            ProcessAction::Kill,
            ProcessAction::SetPriority(Priority::High),
            ProcessAction::SetPriority(Priority::Low),
            ProcessAction::SetAffinity(1),
            ProcessAction::SetAffinity(u64::MAX),
        ];
        let observations = [
            None,
            Some(observed(KILL_TARGET.start_time, false)),
            Some(observed(KILL_TARGET.start_time, true)),
            Some(observed(KILL_TARGET.start_time + 1, false)),
        ];
        let as_kill = |effect: Effect| match effect {
            Effect::Act { pid, .. } => Effect::Act {
                pid,
                action: ProcessAction::Kill,
            },
            other => other,
        };
        for s in tla::all_states() {
            for observed in observations {
                let event = |action| Event::ProcessActionRequested {
                    target: KILL_TARGET,
                    observed,
                    action,
                };
                let base = step(s, &event(ProcessAction::Kill)).unwrap();
                for action in actions {
                    let t = step(s, &event(action)).unwrap();
                    assert_eq!(t.state, base.state, "{s:?} {action:?}");
                    assert_eq!(as_kill(t.effect), base.effect, "{s:?} {action:?}");
                    if let Effect::Act { action: done, .. } = t.effect {
                        assert_eq!(done, action, "頼まれた操作と違う");
                    }
                }
            }
        }
    }
}
