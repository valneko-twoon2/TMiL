//! フロントエンドとの契約（コマンドが返す JSON の形）を固定する。
//! 形を変えたときは `UPDATE_CONTRACT=1 cargo test -p taskmanagerlite-core --test contract` で
//! `tests/contract/fixtures` を作り直し、フロント側の契約テストも通ることを確かめる。

#![allow(
    clippy::unwrap_used,
    clippy::panic,
    reason = "テスト専用の補助関数なので失敗時はその場で止めてよい"
)]

mod contract {
    use std::path::PathBuf;

    use serde::Serialize;
    use taskmanagerlite_core::model::{
        AppWindow, Connection, CpuStats, DiskKind, DiskStats, GpuStats, HandleInfo, KillResult,
        KillTarget, MemoryStats, ModuleInfo, NetworkStats, Priority, ProcessControls, ProcessIcon,
        ProcessInfo, ProcessState, Protocol, ReplacementStatus, ServiceAction, ServiceInfo,
        ServiceStartType, ServiceStatus, Snapshot, SnapshotWire, StartupEntry, StartupLocation,
        SystemInfo, TcpState, process_details,
    };

    fn fixtures_dir() -> PathBuf {
        // ミューテーションテストでは src/backend だけが写されるので、TASKMANAGERLITE_REPO_ROOT で本来の場所を教わる
        std::env::var_os("TASKMANAGERLITE_REPO_ROOT")
            .filter(|v| !v.is_empty())
            .map_or_else(
                || PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.."),
                PathBuf::from,
            )
            .join("tests/contract/fixtures")
    }

    fn check(name: &str, value: &impl Serialize) {
        let json = serde_json::to_string_pretty(value).unwrap() + "\n";
        let path = fixtures_dir().join(format!("{name}.json"));
        if std::env::var_os("UPDATE_CONTRACT").is_some() {
            std::fs::create_dir_all(fixtures_dir()).unwrap();
            std::fs::write(&path, &json).unwrap();
            return;
        }
        let expected = std::fs::read_to_string(&path).unwrap_or_else(|_| {
            panic!(
                "{} がありません。UPDATE_CONTRACT=1 で作ってください",
                path.display()
            )
        });
        assert_eq!(
            expected.replace("\r\n", "\n"),
            json,
            "契約（{name}）が変わりました。意図した変更なら fixtures を更新してください"
        );
    }

    fn process(pid: u32, parent: Option<u32>, name: &str, state: ProcessState) -> ProcessInfo {
        ProcessInfo {
            pid,
            parent_pid: parent,
            name: name.to_owned(),
            exe: format!("/usr/bin/{name}"),
            command: format!("{name} --flag"),
            state,
            user: "user".to_owned(),
            cpu: 12.5,
            memory: 1_048_576,
            disk_read_per_sec: 2048,
            disk_written_per_sec: 0,
            run_time_secs: 3600,
            start_time: 1_767_222_000,
            virtual_memory: 4_194_304,
            cpu_time_ms: 45_000,
            disk_read_total: 10_485_760,
            disk_written_total: 1_048_576,
            // 取れる場合と取れない場合の両方を見本に入れる
            handles: (pid == 100).then_some(120),
            threads: (pid == 100).then_some(8),
            session_id: (pid != 1).then_some(1),
            gpu: (pid == 100).then_some(3.5),
            gpu_memory: (pid == 100).then_some(67_108_864),
            gpu_engine: (pid == 100).then(|| "GPU 0 - 3D".to_owned()),
            efficient: pid == 101,
            app_container: pid == 101,
        }
    }

    fn disk(name: &str, mount_point: &str, kind: DiskKind) -> DiskStats {
        DiskStats {
            name: name.to_owned(),
            mount_point: mount_point.to_owned(),
            file_system: "ext4".to_owned(),
            kind,
            removable: false,
            total: 512_000_000_000,
            available: 200_000_000_000,
            read_per_sec: 4096,
            written_per_sec: 1024,
        }
    }

    #[test]
    fn snapshot() {
        let value = Snapshot {
            timestamp_ms: 1_767_225_600_000,
            cpu: CpuStats {
                usage: 25.5,
                per_core: vec![20.0, 31.0],
                frequency_mhz: 3200,
                process_count: 5,
                uptime_secs: 93_784,
            },
            memory: MemoryStats {
                total: 17_179_869_184,
                used: 8_589_934_592,
                available: 8_589_934_592,
                free: 4_294_967_296,
                swap_total: 4_294_967_296,
                swap_used: 0,
            },
            disks: vec![
                disk("nvme0n1", "/", DiskKind::Ssd),
                disk("sda", "/data", DiskKind::Hdd),
                disk("loop0", "/snap/core", DiskKind::Unknown),
            ],
            networks: vec![NetworkStats {
                name: "eth0".to_owned(),
                received_per_sec: 1000,
                transmitted_per_sec: 200,
                total_received: 1_000_000,
                total_transmitted: 200_000,
                mac_address: "00:11:22:33:44:55".to_owned(),
                addresses: vec!["192.168.1.2/24".to_owned(), "fe80::1/64".to_owned()],
            }],
            gpus: vec![
                GpuStats {
                    name: "Example GPU".to_owned(),
                    vendor: "Example".to_owned(),
                    usage: Some(12.5),
                    memory_total: Some(8_589_934_592),
                    memory_used: Some(1_073_741_824),
                },
                GpuStats {
                    name: "Basic Display".to_owned(),
                    vendor: String::new(),
                    usage: None,
                    memory_total: None,
                    memory_used: None,
                },
            ],
            processes: vec![
                process(1, None, "init", ProcessState::Sleeping),
                process(100, Some(1), "app", ProcessState::Running),
                process(101, Some(1), "paused", ProcessState::Stopped),
                process(102, Some(1), "defunct", ProcessState::Zombie),
                process(103, Some(1), "odd", ProcessState::Other),
            ],
        };
        check("snapshot", &value);
        // 画面に送る形。フロントでは、これと詳細を合わせると上の snapshot と同じになることを確かめる
        check("snapshot-wire", &SnapshotWire::from(&value));
        let pids: Vec<u32> = value.processes.iter().map(|p| p.pid).collect();
        check("process-details", &process_details(&value.processes, &pids));
    }

    #[test]
    fn system_info() {
        check(
            "system-info",
            &SystemInfo {
                os_name: "Ubuntu".to_owned(),
                os_version: "24.04".to_owned(),
                kernel_version: "6.8.0".to_owned(),
                host_name: "host".to_owned(),
                cpu_brand: "Example CPU".to_owned(),
                physical_cores: None,
                logical_cores: 8,
            },
        );
    }

    /// フロントから送られる値。見本どおりの JSON を読めることも確かめる。
    #[test]
    fn kill_targets() {
        let targets = vec![
            KillTarget {
                pid: 100,
                start_time: 1_767_222_000,
            },
            KillTarget {
                pid: 101,
                start_time: 0,
            },
        ];
        check("kill-targets", &targets);
        let text = std::fs::read_to_string(fixtures_dir().join("kill-targets.json")).unwrap();
        let parsed: Vec<KillTarget> = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed, targets);
    }

    #[test]
    fn kill_results() {
        check(
            "kill-results",
            &vec![
                KillResult {
                    pid: 100,
                    ok: true,
                    error: None,
                },
                KillResult {
                    pid: 1,
                    ok: false,
                    error: Some("終了できませんでした。".to_owned()),
                },
            ],
        );
    }

    #[test]
    fn startup_entries() {
        let locations = [
            StartupLocation::RegistryUser,
            StartupLocation::RegistryMachine,
            StartupLocation::FolderUser,
            StartupLocation::FolderCommon,
            StartupLocation::AutostartUser,
            StartupLocation::AutostartSystem,
        ];
        let entries: Vec<StartupEntry> = locations
            .into_iter()
            .enumerate()
            .map(|(i, location)| StartupEntry {
                id: format!("{}:item{i}", location.key()),
                name: format!("Item {i}"),
                command: format!("\"C:\\Apps\\item{i}.exe\" --min"),
                program: format!("C:\\Apps\\item{i}.exe"),
                location,
                enabled: i % 2 == 0,
                can_toggle: i % 3 != 1,
            })
            .collect();
        check("startup-entries", &entries);
    }

    #[test]
    fn replacement_status() {
        check(
            "replacement-status",
            &ReplacementStatus {
                supported: true,
                replaced: false,
                other: Some("C:\\Tools\\procexp.exe".to_owned()),
            },
        );
    }

    #[test]
    fn process_icons() {
        check(
            "process-icons",
            &vec![
                ProcessIcon {
                    exe: r"C:\Windows\explorer.exe".to_owned(),
                    icon: Some("data:image/png;base64,iVBORw0KGgo=".to_owned()),
                    description: Some("エクスプローラー".to_owned()),
                    company: Some("Microsoft Corporation".to_owned()),
                },
                ProcessIcon {
                    exe: "/usr/bin/unknown".to_owned(),
                    icon: None,
                    description: None,
                    company: None,
                },
            ],
        );
    }

    /// フロントの `ICON_REQUEST_LIMIT` も同じ数にする。
    #[test]
    fn icon_request_limit() {
        check(
            "icon-request-limit",
            &taskmanagerlite_core::icons::MAX_PER_REQUEST,
        );
    }

    /// 優先度はすべての値を並べ、フロントと種類が一致するかも確かめる。
    #[test]
    fn process_controls() {
        check(
            "process-controls",
            &vec![
                ProcessControls {
                    priority: Some(Priority::Normal),
                    affinity: Some(vec![0, 1, 2, 3]),
                },
                ProcessControls {
                    priority: None,
                    affinity: None,
                },
            ],
        );
        check("priorities", &Priority::ALL);
    }
    #[test]
    fn app_windows() {
        check(
            "app-windows",
            &vec![
                AppWindow {
                    pid: 1234,
                    title: "メモ帳 - 無題".to_owned(),
                },
                AppWindow {
                    pid: 5678,
                    title: String::new(),
                },
            ],
        );
    }

    /// 状態と開始の種類はすべての値を並べ、フロントと種類が一致するかも確かめる。
    #[test]
    fn services() {
        let statuses = [
            ServiceStatus::Running,
            ServiceStatus::Stopped,
            ServiceStatus::Paused,
            ServiceStatus::StartPending,
            ServiceStatus::StopPending,
            ServiceStatus::Other,
        ];
        let start_types = [
            ServiceStartType::Automatic,
            ServiceStartType::Manual,
            ServiceStartType::Disabled,
            ServiceStartType::Other,
        ];
        let list: Vec<ServiceInfo> = statuses
            .iter()
            .enumerate()
            .map(|(i, &status)| ServiceInfo {
                name: format!("svc{i}"),
                display_name: format!("サービス {i}"),
                description: if i == 0 {
                    "説明".to_owned()
                } else {
                    String::new()
                },
                status,
                pid: (status == ServiceStatus::Running).then_some(100),
                start_type: start_types[i % start_types.len()],
                group: if i == 0 {
                    "netsvcs".to_owned()
                } else {
                    String::new()
                },
            })
            .collect();
        check("services", &list);
        check(
            "service-actions",
            &[
                ServiceAction::Start,
                ServiceAction::Stop,
                ServiceAction::Restart,
            ],
        );
    }

    /// TCP の状態はすべての値を出す。
    #[test]
    fn connections() {
        let states = [
            TcpState::Listen,
            TcpState::Established,
            TcpState::SynSent,
            TcpState::SynReceived,
            TcpState::FinWait1,
            TcpState::FinWait2,
            TcpState::TimeWait,
            TcpState::CloseWait,
            TcpState::LastAck,
            TcpState::Closing,
            TcpState::Closed,
        ];
        let mut list: Vec<Connection> = states
            .iter()
            .enumerate()
            .map(|(i, &state)| Connection {
                protocol: Protocol::Tcp,
                local_address: "192.168.1.2".to_owned(),
                local_port: 50000 + u16::try_from(i).unwrap(),
                remote_address: "203.0.113.5".to_owned(),
                remote_port: 443,
                state: Some(state),
                pid: Some(100),
            })
            .collect();
        list.push(Connection {
            protocol: Protocol::Udp,
            local_address: "::".to_owned(),
            local_port: 5353,
            remote_address: "*".to_owned(),
            remote_port: 0,
            state: None,
            pid: None,
        });
        check("connections", &list);
    }

    #[test]
    fn modules() {
        check(
            "modules",
            &vec![
                ModuleInfo {
                    name: "ntdll.dll".to_owned(),
                    path: r"C:\Windows\SYSTEM32\ntdll.dll".to_owned(),
                    version: Some("10.0.26100.1".to_owned()),
                },
                ModuleInfo {
                    name: "libc.so.6".to_owned(),
                    path: "/usr/lib/libc.so.6".to_owned(),
                    version: None,
                },
            ],
        );
    }

    #[test]
    fn handles() {
        check(
            "handles",
            &vec![
                HandleInfo {
                    pid: 4120,
                    path: r"C:\Users\me\report.docx".to_owned(),
                },
                HandleInfo {
                    pid: 812,
                    path: "/home/me/report.txt".to_owned(),
                },
            ],
        );
    }
}
