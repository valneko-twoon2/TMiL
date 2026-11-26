use super::*;
use crate::machine::{Life, Pending, Window};
use crate::model::KillTarget;
use crate::test_support::spawn_sleeper;

fn backend() -> Backend {
    Backend::new().expect("backend")
}

fn status(replaced: bool, other: Option<&str>) -> ReplacementStatus {
    ReplacementStatus {
        supported: true,
        replaced,
        other: other.map(str::to_owned),
    }
}

/// 一覧に出ているプロセスの終了指定（起動時刻つき）。
fn target_of(b: &Backend, pid: u32) -> KillTarget {
    let snap = b.snapshot().expect("snapshot");
    let p = snap
        .processes
        .iter()
        .find(|p| p.pid == pid)
        .expect("in list");
    KillTarget {
        pid,
        start_time: p.start_time,
    }
}

mod equivalence {
    use super::*;

    #[test]
    fn first_snapshot_samples_and_second_is_served_from_cache() {
        let b = backend();
        let first = b.snapshot().unwrap();
        let second = b.snapshot().unwrap();
        assert_eq!(
            first.timestamp_ms, second.timestamp_ms,
            "間もない依頼は計測し直さない"
        );
        let s = b.state().unwrap();
        assert!(s.cached && !s.sampling);
    }

    #[test]
    fn window_events_report_whether_to_notify() {
        let b = backend();
        assert!(b.window_hidden().unwrap());
        assert!(!b.window_hidden().unwrap(), "2 回目は知らせない");
        assert!(b.window_shown().unwrap());
        assert_eq!(b.state().unwrap().window, Window::Visible);
    }

    #[test]
    fn quit_exits_once() {
        let b = backend();
        assert!(b.quit().unwrap());
        assert!(!b.quit().unwrap());
        assert_eq!(b.state().unwrap().life, Life::Quitting);
        assert!(b.snapshot().is_err(), "終了中は計測しない");
    }

    #[test]
    fn replacement_succeeds_when_state_changes() {
        let b = backend();
        let result = b.set_replacement(true, |_| Ok(()), || status(true, None));
        assert_eq!(result, Ok(status(true, None)));
        assert_eq!(b.state().unwrap().pending, Pending::Idle);
    }

    #[test]
    fn replacement_status_is_told_to_machine() {
        let b = backend();
        let s = b
            .replacement_status(|| status(false, Some("x.exe")))
            .unwrap();
        assert_eq!(s.other.as_deref(), Some("x.exe"));
        assert_eq!(b.state().unwrap().registry, Registry::Other);
    }

    #[test]
    fn unsupported_replacement_status_is_not_told_to_machine() {
        let b = backend();
        let unsupported = ReplacementStatus {
            supported: false,
            replaced: false,
            other: None,
        };
        b.replacement_status(|| unsupported.clone()).unwrap();
        assert_eq!(b.state().unwrap().registry, Registry::Unknown);
    }

    #[test]
    fn killing_unprotected_child_with_matching_start_time() {
        let mut child = spawn_sleeper();
        let collector = Collector::new().unwrap().without_self_protection();
        let b = Backend::with_collector(collector);
        let target = target_of(&b, child.id());
        let result = b.kill(&[target]).unwrap();
        assert!(result[0].ok, "{:?}", result[0].error);
        assert!(!child.wait().unwrap().success());
    }

    #[test]
    fn registry_of_maps_status() {
        assert_eq!(registry_of(&status(true, None)), Registry::Replaced);
        assert_eq!(registry_of(&status(false, Some("p"))), Registry::Other);
        assert_eq!(registry_of(&status(false, None)), Registry::NotReplaced);
    }

    #[test]
    fn system_info_has_cores() {
        assert!(backend().system_info().unwrap().logical_cores >= 1);
    }
}

mod boundary {
    use super::*;

    #[test]
    fn staleness_switches_exactly_at_the_minimum_interval() {
        let at = Instant::now();
        assert!(is_stale(None, at));
        assert!(!is_stale(Some(at), at));
        assert!(!is_stale(
            Some(at),
            at + MIN_SAMPLE_INTERVAL
                .checked_sub(Duration::from_millis(1))
                .unwrap()
        ));
        assert!(is_stale(Some(at), at + MIN_SAMPLE_INTERVAL));
    }

    #[test]
    fn time_going_backwards_is_not_stale() {
        let at = Instant::now() + Duration::from_secs(5);
        assert!(!is_stale(Some(at), Instant::now()));
    }

    #[test]
    fn hidden_window_before_first_sample_is_rejected() {
        let b = backend();
        b.window_hidden().unwrap();
        assert!(b.snapshot().unwrap_err().contains("隠れている"));
    }

    #[test]
    fn empty_kill_list() {
        assert_eq!(backend().kill(&[]).unwrap(), Vec::new());
    }

    #[test]
    fn unknown_pid_is_not_found() {
        let r = backend()
            .kill(&[KillTarget {
                pid: u32::MAX - 1,
                start_time: 0,
            }])
            .unwrap();
        assert!(r[0].error.as_deref().unwrap().contains("見つかりません"));
    }
}

/// これまでに直した不具合が、実際の処理の流れでも起きないこと。
mod regression {
    use super::*;

    /// ウィンドウが隠れている間も計測していた（トレイ常駐中に重くなる）。
    #[test]
    fn hidden_window_serves_cache_without_sampling() {
        let b = backend();
        let first = b.snapshot().unwrap();
        b.window_hidden().unwrap();
        std::thread::sleep(MIN_SAMPLE_INTERVAL);
        let later = b.snapshot().unwrap();
        assert_eq!(first.timestamp_ms, later.timestamp_ms);
    }

    /// UAC を取り消しても成功扱いになっていた。
    #[test]
    fn cancelled_elevation_is_an_error() {
        let b = backend();
        let result = b.set_replacement(
            true,
            |_| Err("取り消されました".to_owned()),
            || status(false, None),
        );
        assert_eq!(result, Err("取り消されました".to_owned()));
        let again = b.set_replacement(true, |_| Ok(()), || status(false, None));
        assert!(again.unwrap_err().contains("反映されませんでした"));
    }

    /// TMiL 自身の子プロセス（WebView など）まで終了できてしまい、画面が落ちていた。
    #[test]
    fn own_child_process_is_not_killed() {
        let mut child = spawn_sleeper();
        let b = backend();
        let target = target_of(&b, child.id());
        let result = b.kill(&[target]).unwrap();
        let alive = child.try_wait().unwrap().is_none();
        let _ = child.kill();
        let _ = child.wait();
        assert!(!result[0].ok);
        assert!(result[0].error.as_deref().unwrap().contains("TMiL"));
        assert!(alive, "子プロセスが終了されている");
    }

    /// 一覧が古いと、PID が再利用された別のプロセスを終了しうる。
    #[test]
    fn process_with_different_start_time_is_not_killed() {
        let mut child = spawn_sleeper();
        let b = Backend::with_collector(Collector::new().unwrap().without_self_protection());
        let target = target_of(&b, child.id());
        let stale = KillTarget {
            start_time: target.start_time + 1,
            ..target
        };
        let result = b.kill(&[stale]).unwrap();
        let alive = child.try_wait().unwrap().is_none();
        let _ = child.kill();
        let _ = child.wait();
        assert!(result[0].error.as_deref().unwrap().contains("入れ替わって"));
        assert!(alive, "別のプロセスとみなして終了してはいけない");
    }

    /// 自分自身は終了しない。
    #[test]
    fn own_process_is_not_killed() {
        let b = backend();
        let target = target_of(&b, std::process::id());
        let result = b.kill(&[target]).unwrap();
        assert!(!result[0].ok);
    }
}
