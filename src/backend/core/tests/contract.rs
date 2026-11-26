//! フロントエンドとの契約（コマンドが返す JSON の形）を固定する。
//! 形を変えたときは `UPDATE_CONTRACT=1 cargo test -p tmil-core --test contract` で
//! `tests/contract/fixtures` を作り直し、フロント側の契約テストも通ることを確かめる。

#![allow(
    clippy::unwrap_used,
    clippy::panic,
    reason = "テスト専用の補助関数なので失敗時はその場で止めてよい"
)]

mod contract {
    use std::path::PathBuf;

    use serde::Serialize;
    use tmil_core::model::{
        CpuStats, DiskKind, DiskStats, KillResult, MemoryStats, NetworkStats, ProcessInfo,
        ProcessState, ReplacementStatus, Snapshot, StartupEntry, StartupLocation, SystemInfo,
    };

    fn fixtures_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../tests/contract/fixtures")
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
        }
    }

    fn disk(name: &str, kind: DiskKind) -> DiskStats {
        DiskStats {
            name: name.to_owned(),
            mount_point: "/".to_owned(),
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
                swap_total: 4_294_967_296,
                swap_used: 0,
            },
            disks: vec![
                disk("nvme0n1", DiskKind::Ssd),
                disk("sda", DiskKind::Hdd),
                disk("loop0", DiskKind::Unknown),
            ],
            networks: vec![NetworkStats {
                name: "eth0".to_owned(),
                received_per_sec: 1000,
                transmitted_per_sec: 200,
                total_received: 1_000_000,
                total_transmitted: 200_000,
            }],
            processes: vec![
                process(1, None, "init", ProcessState::Sleeping),
                process(100, Some(1), "app", ProcessState::Running),
                process(101, Some(1), "paused", ProcessState::Stopped),
                process(102, Some(1), "defunct", ProcessState::Zombie),
                process(103, Some(1), "odd", ProcessState::Other),
            ],
        };
        check("snapshot", &value);
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
}
