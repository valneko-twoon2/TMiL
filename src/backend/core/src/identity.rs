//! 管理者でないと、ほかのアカウントのプロセスは開けず、sysinfo では場所もユーザーも空になる。
//! Windows では、プロセスを開かなくても場所を返す `NtQuerySystemInformation`
//! （SystemProcessIdInformation）と、サービスの設定（`Win32_Service` の `StartName`）から補う。
//! 管理者として動いている自分のアカウントのプロセス（サービスでないもの）のユーザーは、管理者でないと分からない。

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

pub const LOOKUP_INTERVAL: Duration = Duration::from_secs(10);

/// 補った情報。分からないものは空。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Identity {
    pub exe: String,
    /// アカウント（本家と同じ `SYSTEM` `LOCAL SERVICE` などの書き方）
    pub user: String,
}

/// サービスの `StartName` を、本家のユーザー名の列と同じ書き方にする。
pub fn account_label(start_name: &str) -> String {
    let name = start_name.trim();
    let lower = name.to_ascii_lowercase();
    let short = lower.rsplit('\\').next().unwrap_or_default();
    match short {
        "localsystem" | "system" => "SYSTEM".to_owned(),
        "localservice" | "local service" => "LOCAL SERVICE".to_owned(),
        "networkservice" | "network service" => "NETWORK SERVICE".to_owned(),
        _ => name.rsplit('\\').next().unwrap_or_default().to_owned(),
    }
}

pub fn same_image(exe: &str, name: &str) -> bool {
    let file = exe.rsplit(['\\', '/']).next().unwrap_or_default();
    !file.is_empty() && file.eq_ignore_ascii_case(name)
}

/// スクリプトの出力（`PID<TAB>場所<TAB>StartName` の行）を読む。
pub fn parse(output: &str) -> HashMap<u32, Identity> {
    output
        .lines()
        .filter_map(|line| {
            let mut fields = line.trim_end_matches('\r').split('\t');
            let pid = fields.next()?.trim().parse().ok()?;
            let exe = fields.next().unwrap_or_default().trim().to_owned();
            let user = account_label(fields.next().unwrap_or_default());
            Some((pid, Identity { exe, user }))
        })
        .collect()
}

pub fn due<S: std::hash::BuildHasher>(
    missing: &[u32],
    asked: &HashSet<u32, S>,
    last: Option<Instant>,
    now: Instant,
) -> Vec<u32> {
    if last.is_some_and(|t| now.duration_since(t) < LOOKUP_INTERVAL) {
        return Vec::new();
    }
    missing
        .iter()
        .copied()
        .filter(|pid| !asked.contains(pid))
        .collect()
}

/// 標準入力で受け取った PID ごとに、場所とサービスのアカウントを出す。
pub const WINDOWS_SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class TaskManagerLiteIdentity {
    [StructLayout(LayoutKind.Sequential)]
    struct UnicodeString { public ushort Length; public ushort MaximumLength; public IntPtr Buffer; }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessIdInformation { public IntPtr ProcessId; public UnicodeString ImageName; }
    [DllImport("ntdll.dll")]
    static extern int NtQuerySystemInformation(int infoClass, ref ProcessIdInformation info, int length, out int returned);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern uint QueryDosDevice(string name, StringBuilder target, int max);
    const int SystemProcessIdInformation = 0x58;
    const int Capacity = 32768;
    static Dictionary<string, string> devices;
    static string ToDos(string path) {
        if (devices == null) {
            devices = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var drive in Environment.GetLogicalDrives()) {
                var letter = drive.TrimEnd('\\');
                var target = new StringBuilder(1024);
                if (QueryDosDevice(letter, target, target.Capacity) != 0) devices[target.ToString()] = letter;
            }
        }
        foreach (var d in devices) {
            if (path.StartsWith(d.Key + "\\", StringComparison.OrdinalIgnoreCase)) return d.Value + path.Substring(d.Key.Length);
        }
        return "";
    }
    public static string Path(int pid) {
        var buffer = Marshal.AllocHGlobal(Capacity);
        try {
            var info = new ProcessIdInformation();
            info.ProcessId = (IntPtr)pid;
            info.ImageName.MaximumLength = (ushort)(Capacity - 2);
            info.ImageName.Buffer = buffer;
            int returned;
            if (NtQuerySystemInformation(SystemProcessIdInformation, ref info, Marshal.SizeOf(info), out returned) != 0) return "";
            return ToDos(Marshal.PtrToStringUni(buffer, info.ImageName.Length / 2));
        } finally {
            Marshal.FreeHGlobal(buffer);
        }
    }
}
'@
$accounts = @{}
foreach ($s in Get-CimInstance Win32_Service -Filter "State='Running'" -Property ProcessId, StartName) {
    $id = [int]$s.ProcessId
    if ($id -gt 0 -and -not $accounts.ContainsKey($id)) { $accounts[$id] = [string]$s.StartName }
}
foreach ($word in [Console]::In.ReadToEnd() -split '\s+') {
    if ($word -eq '') { continue }
    $id = [int]$word
    "$id`t$([TaskManagerLiteIdentity]::Path($id))`t$($accounts[$id])"
}
"#;

#[derive(Debug, Default)]
pub struct IdentityLookup {
    known: HashMap<u32, Identity>,
    asked: HashSet<u32>,
    last: Option<Instant>,
    pending: Option<std::sync::mpsc::Receiver<HashMap<u32, Identity>>>,
}

impl IdentityLookup {
    /// 届いた結果を取り込み、足りないプロセスのうち、まだ聞いていないものを裏で聞く。
    /// `alive` は今あるプロセス（いなくなったものは忘れる）。
    pub fn update(&mut self, missing: &[u32], alive: &HashSet<u32>, now: Instant) {
        if let Some(rx) = &self.pending {
            match rx.try_recv() {
                Ok(found) => {
                    self.known.extend(found);
                    self.pending = None;
                }
                Err(std::sync::mpsc::TryRecvError::Disconnected) => self.pending = None,
                Err(std::sync::mpsc::TryRecvError::Empty) => {}
            }
        }
        self.known.retain(|pid, _| alive.contains(pid));
        self.asked.retain(|pid| alive.contains(pid));
        if self.pending.is_some() {
            return;
        }
        let pids = due(missing, &self.asked, self.last, now);
        if pids.is_empty() {
            return;
        }
        self.last = Some(now);
        self.asked.extend(pids.iter().copied());
        self.pending = spawn_lookup(&pids);
    }

    pub fn get(&self, pid: u32) -> Option<&Identity> {
        self.known.get(&pid)
    }
}

#[cfg(windows)]
fn spawn_lookup(pids: &[u32]) -> Option<std::sync::mpsc::Receiver<HashMap<u32, Identity>>> {
    let (tx, rx) = std::sync::mpsc::channel();
    let input = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    std::thread::Builder::new()
        .name("identity".to_owned())
        .spawn(move || {
            let found = crate::powershell::run_encoded(WINDOWS_SCRIPT, &input)
                .map(|out| parse(&out))
                .unwrap_or_default();
            let _ = tx.send(found);
        })
        .ok()?;
    Some(rx)
}

#[cfg(not(windows))]
fn spawn_lookup(_pids: &[u32]) -> Option<std::sync::mpsc::Receiver<HashMap<u32, Identity>>> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn service_accounts_use_the_task_manager_names() {
            assert_eq!(account_label("LocalSystem"), "SYSTEM");
            assert_eq!(account_label(r"NT AUTHORITY\LocalService"), "LOCAL SERVICE");
            assert_eq!(
                account_label(r"NT AUTHORITY\NetworkService"),
                "NETWORK SERVICE"
            );
            assert_eq!(account_label(r".\alice"), "alice");
            assert_eq!(account_label(r"CORP\bob"), "bob");
        }

        #[test]
        fn image_must_match_the_process_name() {
            assert!(same_image(
                r"C:\Windows\System32\svchost.exe",
                "svchost.exe"
            ));
            assert!(same_image(
                r"C:\Windows\System32\SVCHOST.EXE",
                "svchost.exe"
            ));
            assert!(!same_image(r"C:\Windows\System32\svchost.exe", "csrss.exe"));
        }

        #[test]
        fn parses_tab_separated_lines() {
            let found = parse(
                "4\t\t\r\n1692\tC:\\Windows\\System32\\svchost.exe\tLocalSystem\r\n9\tC:\\a.exe\t\n",
            );
            assert_eq!(found.len(), 3);
            assert_eq!(
                found[&1692],
                Identity {
                    exe: r"C:\Windows\System32\svchost.exe".to_owned(),
                    user: "SYSTEM".to_owned(),
                }
            );
            assert_eq!(found[&4], Identity::default());
            assert_eq!(found[&9].user, "");
        }

        #[test]
        fn asks_only_new_pids_after_the_interval() {
            let now = Instant::now();
            let asked: HashSet<u32> = [1].into();
            assert_eq!(due(&[1, 2], &asked, None, now), vec![2]);
            assert_eq!(due(&[1, 2], &asked, Some(now), now), Vec::<u32>::new());
            assert_eq!(
                due(&[1, 2], &asked, Some(now), now + LOOKUP_INTERVAL),
                vec![2]
            );
        }

        #[test]
        fn script_reads_pids_from_stdin_and_queries_without_opening() {
            assert!(WINDOWS_SCRIPT.contains("[Console]::In.ReadToEnd()"));
            assert!(WINDOWS_SCRIPT.contains("NtQuerySystemInformation"));
            assert!(WINDOWS_SCRIPT.contains("StartName"));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_and_broken_values() {
            assert_eq!(account_label(""), "");
            assert_eq!(account_label("  LocalSystem  "), "SYSTEM");
            assert!(!same_image("", "a.exe"));
            assert!(!same_image(r"C:\dir\", "a.exe"));
            assert!(parse("").is_empty());
            assert!(parse("x\tC:\\a.exe\t\nnot a line").is_empty());
            assert_eq!(
                due(&[], &HashSet::new(), None, Instant::now()),
                Vec::<u32>::new()
            );
        }

        #[test]
        fn forgets_processes_that_are_gone() {
            let mut lookup = IdentityLookup::default();
            lookup.known.insert(1, Identity::default());
            lookup.asked.insert(1);
            lookup.last = Some(Instant::now());
            lookup.update(&[], &HashSet::new(), Instant::now());
            assert!(lookup.get(1).is_none());
            assert!(lookup.asked.is_empty());
        }
    }

    #[cfg(windows)]
    mod system {
        use super::*;

        /// 開けないことがある svchost.exe の場所とアカウントが取れる
        #[test]
        fn finds_service_host_paths_without_opening_them() {
            let system = sysinfo::System::new_all().expect("sysinfo");
            let pids: Vec<u32> = system
                .processes()
                .values()
                .filter(|p| p.name().eq_ignore_ascii_case("svchost.exe"))
                .map(|p| p.pid().as_u32())
                .collect();
            if pids.is_empty() {
                return;
            }
            let input = pids.iter().map(u32::to_string).collect::<Vec<_>>().join(
                "
",
            );
            let out = crate::powershell::run_encoded(WINDOWS_SCRIPT, &input)
                .expect("スクリプトが動くはず");
            let found = parse(&out);
            // 調べている間に終わったものは空になるので、取れたものだけ確かめる
            let named: Vec<&Identity> = found.values().filter(|i| !i.exe.is_empty()).collect();
            assert!(!named.is_empty(), "{found:?}");
            assert!(
                named.iter().all(|i| same_image(&i.exe, "svchost.exe")),
                "{found:?}"
            );
            assert!(named.iter().any(|i| !i.user.is_empty()), "{found:?}");
        }
    }
}
