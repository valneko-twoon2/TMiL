use std::fmt;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use sysinfo::{
    CpuRefreshKind, DiskRefreshKind, Disks, MemoryRefreshKind, Networks, Pid, ProcessRefreshKind,
    ProcessStatus, ProcessesToUpdate, RefreshKind, System, UpdateKind, Users,
};

use crate::gpu::GpuSampler;
use crate::identity::{IdentityLookup, same_image};
use crate::machine::ObservedProcess;
use crate::metrics::{clamp_percent, normalize_cpu, per_second, truncate_chars};
use crate::model::{
    CpuStats, DiskKind, DiskStats, MemoryStats, NetworkStats, ProcessInfo, ProcessState, Snapshot,
    SystemInfo,
};
use crate::process_flags::FlagsSampler;
use crate::procfs;

const COMMAND_MAX_CHARS: usize = 1024;

/// プロセスごとの GPU 使用率を取り直す間隔。取るのに時間がかかる（Windows で 20ms ほど）ので、
/// 毎回は取らず、間は前の値を使う。
const PROCESS_GPU_INTERVAL: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollectorError(String);

impl fmt::Display for CollectorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "システム情報を取得できません: {}", self.0)
    }
}

impl std::error::Error for CollectorError {}

fn init_error(what: &str, err: &sysinfo::Error) -> CollectorError {
    CollectorError(format!("{what}: {err:?}"))
}

/// システムの状態を集める。呼ぶたびに差分（CPU 使用率や転送量）を更新する。
#[derive(Debug)]
pub struct Collector {
    system: System,
    disks: Disks,
    networks: Networks,
    users: Users,
    gpus: GpuSampler,
    last_refresh: Option<Instant>,
    last_process_gpu: Option<Instant>,
    protected_root: Option<u32>,
    identity: IdentityLookup,
    flags: FlagsSampler,
}

impl Collector {
    pub fn new() -> Result<Self, CollectorError> {
        let system = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()),
        )
        .map_err(|e| init_error("system", &e))?;
        let disks = Disks::new_with_refreshed_list_specifics(DiskRefreshKind::everything())
            .map_err(|e| init_error("disks", &e))?;
        let networks =
            Networks::new_with_refreshed_list().map_err(|e| init_error("networks", &e))?;
        let users = Users::new_with_refreshed_list().map_err(|e| init_error("users", &e))?;
        Ok(Self {
            system,
            disks,
            networks,
            users,
            gpus: GpuSampler::start(),
            last_refresh: None,
            last_process_gpu: None,
            protected_root: Some(std::process::id()),
            identity: IdentityLookup::default(),
            flags: FlagsSampler::start(),
        })
    }

    pub fn snapshot(&mut self) -> Snapshot {
        let now = Instant::now();
        let elapsed = self
            .last_refresh
            .map_or(Duration::ZERO, |last| now.duration_since(last));
        self.last_refresh = Some(now);
        let with_gpu = is_due(self.last_process_gpu, now, PROCESS_GPU_INTERVAL);
        if with_gpu {
            self.last_process_gpu = Some(now);
        }
        self.refresh(with_gpu);
        self.update_identity(now);

        let logical_cores = self.system.cpus().len();
        let processes = self.processes(elapsed, logical_cores);
        Snapshot {
            timestamp_ms: unix_millis(SystemTime::now()),
            cpu: self.cpu_stats(processes.len()),
            memory: self.memory_stats(),
            disks: self.disk_stats(elapsed),
            networks: self.network_stats(elapsed),
            gpus: self.gpus.sample(),
            processes,
        }
    }

    pub fn system_info(&self) -> SystemInfo {
        SystemInfo {
            os_name: System::name().unwrap_or_default(),
            os_version: System::os_version().unwrap_or_default(),
            kernel_version: System::kernel_version().unwrap_or_default(),
            host_name: System::host_name().unwrap_or_default(),
            cpu_brand: self
                .system
                .cpus()
                .first()
                .map(|c| c.brand().trim().to_owned())
                .unwrap_or_default(),
            physical_cores: System::physical_core_count().ok(),
            logical_cores: self.system.cpus().len(),
        }
    }

    /// 親子関係を確かめるため、全プロセスの一覧を最新にする（終了の前に呼ぶ）。
    pub fn refresh_process_list(&mut self) {
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing(),
        );
    }

    fn parent_of(&self, pid: u32) -> Option<u32> {
        self.system
            .process(Pid::from_u32(pid))
            .and_then(sysinfo::Process::parent)
            .map(Pid::as_u32)
    }

    pub fn observe(&self, pid: u32) -> Option<ObservedProcess> {
        let process = self.system.process(Pid::from_u32(pid))?;
        Some(ObservedProcess {
            start_time: process.start_time(),
            protected: self
                .protected_root
                .is_some_and(|root| is_self_or_descendant(pid, root, |p| self.parent_of(p))),
        })
    }

    /// プロセスを終了する。終了できたか（権限が足りなければ false）を返す。
    pub fn terminate(&self, pid: u32) -> bool {
        self.system
            .process(Pid::from_u32(pid))
            .is_some_and(sysinfo::Process::kill)
    }

    /// テスト用: 自分の子孫を守る仕組みを外す（子プロセスを終了させて確かめるため）。
    #[cfg(test)]
    pub(crate) fn without_self_protection(mut self) -> Self {
        self.protected_root = None;
        self
    }

    fn refresh(&mut self, with_gpu: bool) {
        let mut kind = ProcessRefreshKind::nothing()
            .with_cpu()
            .with_memory()
            .with_disk_usage()
            .with_user(UpdateKind::OnlyIfNotSet)
            .with_exe(UpdateKind::OnlyIfNotSet)
            .with_cmd(UpdateKind::OnlyIfNotSet);
        if with_gpu {
            kind = kind.with_gpu_usage().with_gpu_memory();
        }
        self.system
            .refresh_cpu_specifics(CpuRefreshKind::nothing().with_usage().with_frequency());
        self.system.refresh_memory();
        self.system
            .refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
        self.disks.refresh_specifics(
            true,
            DiskRefreshKind::nothing().with_storage().with_io_usage(),
        );
        self.networks.refresh(true);
    }

    fn update_identity(&mut self, now: Instant) {
        let processes = self.system.processes();
        let alive = processes.keys().map(|p| p.as_u32()).collect();
        let missing: Vec<u32> = processes
            .values()
            .filter(|p| p.exe().is_none())
            .map(|p| p.pid().as_u32())
            .collect();
        self.identity.update(&missing, &alive, now);
    }

    fn processes(&self, elapsed: Duration, logical_cores: usize) -> Vec<ProcessInfo> {
        self.system
            .processes()
            .values()
            .filter(|p| p.thread_kind().is_none())
            .map(|p| {
                let usage = p.disk_usage();
                let flags = self.flags.get(p.pid().as_u32());
                let name = p.name().to_string_lossy().into_owned();
                let identity = self
                    .identity
                    .get(p.pid().as_u32())
                    .filter(|i| same_image(&i.exe, &name));
                ProcessInfo {
                    pid: p.pid().as_u32(),
                    parent_pid: p.parent().map(Pid::as_u32),
                    exe: p.exe().map_or_else(
                        || identity.map(|i| i.exe.clone()).unwrap_or_default(),
                        |e| e.to_string_lossy().into_owned(),
                    ),
                    name,
                    command: truncate_chars(&join_command(p.cmd()), COMMAND_MAX_CHARS),
                    state: map_status(p.status()),
                    user: p
                        .user_id()
                        .and_then(|uid| self.users.get_user_by_id(uid))
                        .map(|u| u.name().to_owned())
                        .or_else(|| identity.map(|i| i.user.clone()))
                        .unwrap_or_default(),
                    cpu: normalize_cpu(p.cpu_usage(), logical_cores),
                    memory: p.memory(),
                    disk_read_per_sec: per_second(usage.read_bytes, elapsed),
                    disk_written_per_sec: per_second(usage.written_bytes, elapsed),
                    run_time_secs: p.run_time(),
                    start_time: p.start_time(),
                    virtual_memory: p.virtual_memory(),
                    cpu_time_ms: p.accumulated_cpu_time(),
                    disk_read_total: usage.total_read_bytes,
                    disk_written_total: usage.total_written_bytes,
                    handles: p.open_files().map(saturate_u32),
                    threads: procfs::thread_count(p.pid().as_u32()),
                    session_id: p.session_id().map(Pid::as_u32),
                    gpu: p.gpu_usage().map(clamp_percent),
                    gpu_memory: p.gpu_memory(),
                    gpu_engine: flags.gpu_engine,
                    efficient: flags.efficient,
                    app_container: flags.app_container,
                }
            })
            .collect()
    }

    fn cpu_stats(&self, process_count: usize) -> CpuStats {
        let cpus = self.system.cpus();
        CpuStats {
            usage: clamp_percent(self.system.global_cpu_usage()),
            per_core: cpus.iter().map(|c| clamp_percent(c.usage())).collect(),
            frequency_mhz: cpus.first().map_or(0, sysinfo::Cpu::frequency),
            process_count,
            uptime_secs: System::uptime().unwrap_or(0),
        }
    }

    fn memory_stats(&self) -> MemoryStats {
        MemoryStats {
            total: self.system.total_memory(),
            used: self.system.used_memory(),
            available: self.system.available_memory(),
            free: self.system.free_memory(),
            swap_total: self.system.total_swap(),
            swap_used: self.system.used_swap(),
        }
    }

    fn disk_stats(&self, elapsed: Duration) -> Vec<DiskStats> {
        self.disks
            .iter()
            .map(|d| {
                let usage = d.usage();
                DiskStats {
                    name: d.name().to_string_lossy().into_owned(),
                    mount_point: d.mount_point().to_string_lossy().into_owned(),
                    file_system: d.file_system().to_string_lossy().into_owned(),
                    kind: map_disk_kind(d.kind()),
                    removable: d.is_removable(),
                    total: d.total_space(),
                    available: d.available_space(),
                    read_per_sec: per_second(usage.read_bytes, elapsed),
                    written_per_sec: per_second(usage.written_bytes, elapsed),
                }
            })
            .collect()
    }

    fn network_stats(&self, elapsed: Duration) -> Vec<NetworkStats> {
        let mut list: Vec<NetworkStats> = self
            .networks
            .iter()
            .map(|(name, data)| NetworkStats {
                name: name.to_string_lossy().into_owned(),
                received_per_sec: per_second(data.received(), elapsed),
                transmitted_per_sec: per_second(data.transmitted(), elapsed),
                total_received: data.total_received(),
                total_transmitted: data.total_transmitted(),
                mac_address: mac_text(data.mac_address().0),
                addresses: data
                    .ip_networks()
                    .iter()
                    .map(|n| format!("{}/{}", n.addr, n.prefix))
                    .collect(),
            })
            .collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }
}

pub fn is_due(last: Option<Instant>, now: Instant, interval: Duration) -> bool {
    last.is_none_or(|at| now.saturating_duration_since(at) >= interval)
}

pub fn saturate_u32(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// MAC アドレスを `aa:bb:cc:dd:ee:ff` の形にする。すべて 0 なら空（取れていない）。
pub fn mac_text(bytes: [u8; 6]) -> String {
    if bytes == [0; 6] {
        return String::new();
    }
    bytes
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

/// `pid` が `root` 自身か、その子孫かを親をたどって調べる。親子関係がループしていても止まる。
pub fn is_self_or_descendant(pid: u32, root: u32, parent_of: impl Fn(u32) -> Option<u32>) -> bool {
    let mut current = pid;
    for _ in 0..1024 {
        if current == root {
            return true;
        }
        match parent_of(current) {
            Some(parent) if parent != current => current = parent,
            _ => return false,
        }
    }
    false
}

pub fn map_status(status: ProcessStatus) -> ProcessState {
    match status {
        ProcessStatus::Run | ProcessStatus::Waking => ProcessState::Running,
        ProcessStatus::Sleep
        | ProcessStatus::Idle
        | ProcessStatus::UninterruptibleDiskSleep
        | ProcessStatus::Parked => ProcessState::Sleeping,
        ProcessStatus::Stop | ProcessStatus::Tracing => ProcessState::Stopped,
        ProcessStatus::Zombie | ProcessStatus::Dead => ProcessState::Zombie,
        _ => ProcessState::Other,
    }
}

pub fn map_disk_kind(kind: sysinfo::DiskKind) -> DiskKind {
    match kind {
        sysinfo::DiskKind::SSD => DiskKind::Ssd,
        sysinfo::DiskKind::HDD => DiskKind::Hdd,
        sysinfo::DiskKind::Unknown(_) => DiskKind::Unknown,
    }
}

pub fn join_command(args: &[std::ffi::OsString]) -> String {
    args.iter()
        .map(|a| a.to_string_lossy())
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn unix_millis(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    mod equivalence {
        use super::*;

        #[test]
        fn running_like_statuses_map_to_running() {
            assert_eq!(map_status(ProcessStatus::Run), ProcessState::Running);
            assert_eq!(map_status(ProcessStatus::Waking), ProcessState::Running);
        }

        #[test]
        fn sleeping_like_statuses_map_to_sleeping() {
            for s in [
                ProcessStatus::Sleep,
                ProcessStatus::Idle,
                ProcessStatus::UninterruptibleDiskSleep,
                ProcessStatus::Parked,
            ] {
                assert_eq!(map_status(s), ProcessState::Sleeping);
            }
        }

        #[test]
        fn stopped_and_zombie_statuses() {
            assert_eq!(map_status(ProcessStatus::Stop), ProcessState::Stopped);
            assert_eq!(map_status(ProcessStatus::Tracing), ProcessState::Stopped);
            assert_eq!(map_status(ProcessStatus::Zombie), ProcessState::Zombie);
            assert_eq!(map_status(ProcessStatus::Dead), ProcessState::Zombie);
        }

        #[test]
        fn other_statuses_map_to_other() {
            assert_eq!(map_status(ProcessStatus::Unknown(7)), ProcessState::Other);
            assert_eq!(map_status(ProcessStatus::LockBlocked), ProcessState::Other);
        }

        #[test]
        fn disk_kinds_map() {
            assert_eq!(map_disk_kind(sysinfo::DiskKind::SSD), DiskKind::Ssd);
            assert_eq!(map_disk_kind(sysinfo::DiskKind::HDD), DiskKind::Hdd);
            assert_eq!(
                map_disk_kind(sysinfo::DiskKind::Unknown(-1)),
                DiskKind::Unknown
            );
        }

        #[test]
        fn mac_address_is_lowercase_hex_with_colons() {
            assert_eq!(
                mac_text([0x00, 0x1a, 0x2B, 0xff, 0x09, 0x10]),
                "00:1a:2b:ff:09:10"
            );
        }

        #[test]
        fn small_counts_are_kept() {
            assert_eq!(saturate_u32(120), 120);
        }

        #[test]
        fn join_command_uses_spaces() {
            let args = [OsString::from("app.exe"), OsString::from("--flag")];
            assert_eq!(join_command(&args), "app.exe --flag");
        }
    }

    mod regression {
        use super::*;

        /// 自分の子孫（WebView など）かどうかを親をたどって判定する。
        #[test]
        fn descendants_of_root_are_detected() {
            let parents = [(30, 20), (20, 10), (40, 1)];
            let parent_of = |pid: u32| parents.iter().find(|(c, _)| *c == pid).map(|(_, p)| *p);
            assert!(is_self_or_descendant(10, 10, parent_of));
            assert!(is_self_or_descendant(30, 10, parent_of));
            assert!(!is_self_or_descendant(40, 10, parent_of));
            assert!(!is_self_or_descendant(99, 10, parent_of));
        }

        #[test]
        fn cyclic_parent_chain_does_not_hang() {
            let parent_of = |pid: u32| Some(if pid == 1 { 2 } else { 1 });
            assert!(!is_self_or_descendant(1, 10, parent_of));
        }
    }

    mod environment {
        use super::*;

        #[test]
        fn error_message_says_what_failed() {
            let e = CollectorError("理由".to_owned());
            assert_eq!(e.to_string(), "システム情報を取得できません: 理由");
        }

        #[test]
        fn terminating_missing_process_fails() {
            let c = Collector::new().unwrap();
            assert!(!c.terminate(u32::MAX - 1));
        }

        /// 実機には、少なくとも 1 つのディスクとネットワーク（ループバックを含む）がある
        #[test]
        fn real_machine_has_disks_and_networks() {
            let mut c = Collector::new().unwrap();
            let snap = c.snapshot();
            assert!(!snap.disks.is_empty(), "ディスクが 1 つも取れていない");
            assert!(
                !snap.networks.is_empty(),
                "ネットワークが 1 つも取れていない"
            );
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn due_exactly_at_interval_and_not_before() {
            let start = Instant::now();
            let second = Duration::from_secs(1);
            assert!(is_due(None, start, second));
            assert!(!is_due(Some(start), start, second));
            assert!(!is_due(
                Some(start),
                start + Duration::from_millis(999),
                second
            ));
            assert!(is_due(Some(start), start + second, second));
        }

        #[test]
        fn all_zero_mac_address_is_empty() {
            assert_eq!(mac_text([0; 6]), "");
            assert_eq!(mac_text([0, 0, 0, 0, 0, 1]), "00:00:00:00:00:01");
        }

        #[test]
        fn huge_counts_saturate() {
            assert_eq!(saturate_u32(0), 0);
            assert_eq!(saturate_u32(u32::MAX as usize), u32::MAX);
            assert_eq!(saturate_u32(usize::MAX), u32::MAX);
        }

        #[test]
        fn join_command_empty() {
            assert_eq!(join_command(&[]), "");
        }

        #[test]
        fn unix_millis_at_and_before_epoch_is_zero() {
            assert_eq!(unix_millis(UNIX_EPOCH), 0);
            let before = UNIX_EPOCH.checked_sub(Duration::from_secs(1)).unwrap();
            assert_eq!(unix_millis(before), 0);
        }

        #[test]
        fn unix_millis_one_millisecond_after_epoch() {
            assert_eq!(unix_millis(UNIX_EPOCH + Duration::from_millis(1)), 1);
        }
    }

    /// 実際の OS から値を取って、取りうる範囲に収まっているかを見る。
    mod system {
        use super::*;
        use crate::test_support::spawn_sleeper;

        fn collector() -> Collector {
            Collector::new().expect("collector")
        }

        #[test]
        fn snapshot_includes_current_process() {
            let mut c = collector();
            let snap = c.snapshot();
            let me = std::process::id();
            assert!(snap.processes.iter().any(|p| p.pid == me));
            assert_eq!(snap.cpu.process_count, snap.processes.len());
        }

        #[test]
        fn values_stay_in_valid_ranges_across_refreshes() {
            let mut c = collector();
            c.snapshot();
            std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
            let snap = c.snapshot();
            assert!((0.0..=100.0).contains(&snap.cpu.usage));
            assert!(snap.cpu.per_core.iter().all(|u| (0.0..=100.0).contains(u)));
            assert!(
                snap.processes
                    .iter()
                    .all(|p| (0.0..=100.0).contains(&p.cpu))
            );
            assert!(snap.memory.used <= snap.memory.total);
            assert!(snap.memory.free <= snap.memory.total);
            assert!(
                snap.gpus
                    .iter()
                    .all(|g| g.usage.is_none_or(|u| (0.0..=100.0).contains(&u)))
            );
            assert!(
                snap.processes
                    .iter()
                    .all(|p| p.gpu.is_none_or(|u| (0.0..=100.0).contains(&u)))
            );
            assert!(
                snap.networks
                    .iter()
                    .flat_map(|n| &n.addresses)
                    .all(|a| a.contains('/'))
            );
            assert!(snap.memory.total > 0);
            assert!(snap.disks.iter().all(|d| d.available <= d.total));
            assert!(snap.timestamp_ms > 0);
            let names: Vec<_> = snap.networks.iter().map(|n| n.name.clone()).collect();
            let mut sorted = names.clone();
            sorted.sort();
            assert_eq!(names, sorted);
        }

        #[test]
        fn system_info_has_cores() {
            let info = collector().system_info();
            assert!(info.logical_cores >= 1);
            assert!(info.physical_cores.is_none_or(|p| p >= 1));
        }

        #[test]
        fn own_process_and_children_are_protected() {
            let mut child = spawn_sleeper();
            let mut c = collector();
            c.refresh_process_list();
            let me = c.observe(std::process::id()).expect("self");
            let kid = c.observe(child.id()).expect("child");
            let _ = child.kill();
            let _ = child.wait();
            assert!(me.protected);
            assert!(kid.protected, "子プロセスも守る");
        }

        #[test]
        fn own_process_reports_cumulative_values() {
            let mut c = collector();
            let snap = c.snapshot();
            let me = snap
                .processes
                .iter()
                .find(|p| p.pid == std::process::id())
                .unwrap();
            assert!(me.virtual_memory > 0);
            assert!(
                me.handles.is_some_and(|h| h > 0),
                "ハンドル（開いているファイル）が取れていない"
            );
            assert_eq!(me.threads.is_some(), cfg!(target_os = "linux"));
        }

        #[test]
        fn observe_reports_start_time_from_snapshot() {
            let mut c = collector();
            let snap = c.snapshot();
            let me = snap
                .processes
                .iter()
                .find(|p| p.pid == std::process::id())
                .unwrap();
            assert_eq!(c.observe(me.pid).unwrap().start_time, me.start_time);
        }

        #[test]
        fn without_protection_children_are_not_protected_and_can_be_terminated() {
            let mut child = spawn_sleeper();
            let mut c = collector().without_self_protection();
            c.refresh_process_list();
            assert!(!c.observe(child.id()).expect("child").protected);
            assert!(c.terminate(child.id()));
            assert!(!child.wait().expect("wait").success());
        }

        #[test]
        fn unknown_pid_is_not_observed_or_terminated() {
            let mut c = collector();
            c.refresh_process_list();
            assert_eq!(c.observe(u32::MAX - 1), None);
            assert!(!c.terminate(u32::MAX - 1));
        }
    }
}
