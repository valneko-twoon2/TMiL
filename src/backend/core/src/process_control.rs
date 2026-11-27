use crate::model::{Priority, ProcessControls};

pub const MAX_CPUS: u32 = 64;

/// CPU の番号の並びをビットの並びにする。空や範囲外は受け付けない。
pub fn mask_from_cpus(cpus: &[u32]) -> Result<u64, String> {
    if cpus.is_empty() {
        return Err("少なくとも 1 つのプロセッサを選んでください。".to_owned());
    }
    cpus.iter().try_fold(0u64, |mask, &cpu| {
        if cpu < MAX_CPUS {
            Ok(mask | (1u64 << cpu))
        } else {
            Err(format!("プロセッサの番号が範囲外です: {cpu}"))
        }
    })
}

pub fn cpus_from_mask(mask: u64) -> Vec<u32> {
    (0..MAX_CPUS).filter(|i| mask & (1u64 << i) != 0).collect()
}

pub fn windows_class(priority: Priority) -> &'static str {
    match priority {
        Priority::Realtime => "RealTime",
        Priority::High => "High",
        Priority::AboveNormal => "AboveNormal",
        Priority::Normal => "Normal",
        Priority::BelowNormal => "BelowNormal",
        Priority::Low => "Idle",
    }
}

pub fn priority_from_windows_class(name: &str) -> Option<Priority> {
    Priority::ALL
        .into_iter()
        .find(|p| windows_class(*p).eq_ignore_ascii_case(name.trim()))
}

pub fn nice_of(priority: Priority) -> i32 {
    match priority {
        Priority::Realtime => -20,
        Priority::High => -10,
        Priority::AboveNormal => -5,
        Priority::Normal => 0,
        Priority::BelowNormal => 5,
        Priority::Low => 19,
    }
}

pub fn priority_from_nice(nice: i32) -> Priority {
    match nice {
        i32::MIN..=-15 => Priority::Realtime,
        -14..=-8 => Priority::High,
        -7..=-1 => Priority::AboveNormal,
        0 => Priority::Normal,
        1..=9 => Priority::BelowNormal,
        _ => Priority::Low,
    }
}

/// `/proc/<pid>/stat` から nice 値を読む（名前に空白や括弧があっても、最後の `)` の後ろから数える）。
pub fn nice_from_proc_stat(stat: &str) -> Option<i32> {
    let (_, rest) = stat.rsplit_once(')')?;
    // `)` の後ろの 1 つ目が 3 番目の項目（状態）。nice は 19 番目
    rest.split_whitespace().nth(16)?.parse().ok()
}

/// `/proc/<pid>/status` の `Cpus_allowed` を読む（64 個より先の CPU は扱わない）。
pub fn mask_from_proc_status(status: &str) -> Option<u64> {
    let line = status.lines().find(|l| l.starts_with("Cpus_allowed:"))?;
    let hex: String = line
        .trim_start_matches("Cpus_allowed:")
        .chars()
        .filter(char::is_ascii_hexdigit)
        .collect();
    let low = hex.get(hex.len().saturating_sub(16)..)?;
    u64::from_str_radix(low, 16).ok()
}

pub fn windows_read_script(pid: u32) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'; $p = Get-Process -Id {pid}; [Console]::Out.WriteLine(('{{0}} {{1}}' -f $p.PriorityClass, [int64]$p.ProcessorAffinity))"
    )
}

pub fn parse_windows_read(output: &str) -> ProcessControls {
    let mut parts = output.split_whitespace();
    let priority = parts.next().and_then(priority_from_windows_class);
    let affinity = parts
        .next()
        .and_then(|m| m.parse::<i64>().ok())
        .map(|m| cpus_from_mask(m.cast_unsigned()));
    ProcessControls { priority, affinity }
}

pub fn windows_priority_script(pid: u32, priority: Priority) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'; (Get-Process -Id {pid}).PriorityClass = '{}'",
        windows_class(priority)
    )
}

pub fn windows_affinity_script(pid: u32, mask: u64) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'; (Get-Process -Id {pid}).ProcessorAffinity = [IntPtr][int64]{}",
        mask.cast_signed()
    )
}

/// 二重引用符と改行を含むので、[`crate::powershell::run_encoded`] で渡す。
pub const WINDOWS_NATIVE: &str = r#"Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class TaskManagerLiteNative {
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("ntdll.dll")]
    static extern int NtSuspendProcess(IntPtr handle);
    [DllImport("ntdll.dll")]
    static extern int NtResumeProcess(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetProcessInformation(IntPtr handle, int infoClass, ref Throttling info, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetPriorityClass(IntPtr handle, uint priorityClass);
    [StructLayout(LayoutKind.Sequential)]
    struct Throttling { public uint Version; public uint ControlMask; public uint StateMask; }
    const uint SuspendResume = 0x0800;
    const uint SetInformation = 0x0200;
    const int PowerThrottling = 4;
    static IntPtr Open(uint pid, uint access) {
        IntPtr handle = OpenProcess(access, false, pid);
        if (handle == IntPtr.Zero) throw new Win32Exception();
        return handle;
    }
    public static void Suspend(uint pid) {
        IntPtr handle = Open(pid, SuspendResume);
        try { if (NtSuspendProcess(handle) != 0) throw new InvalidOperationException(); }
        finally { CloseHandle(handle); }
    }
    public static void Resume(uint pid) {
        IntPtr handle = Open(pid, SuspendResume);
        try { if (NtResumeProcess(handle) != 0) throw new InvalidOperationException(); }
        finally { CloseHandle(handle); }
    }
    public static void Efficiency(uint pid, bool on) {
        IntPtr handle = Open(pid, SetInformation);
        try {
            Throttling state = new Throttling { Version = 1, ControlMask = on ? 1u : 0u, StateMask = on ? 1u : 0u };
            if (!SetProcessInformation(handle, PowerThrottling, ref state, (uint)Marshal.SizeOf(state))) throw new Win32Exception();
            if (!SetPriorityClass(handle, on ? 0x40u : 0x20u)) throw new Win32Exception();
        } finally { CloseHandle(handle); }
    }
}
'@
"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeOp {
    Suspend,
    Resume,
    Efficiency(bool),
}

pub fn windows_native_script(pid: u32, op: NativeOp) -> String {
    let call = match op {
        NativeOp::Suspend => format!("Suspend({pid})"),
        NativeOp::Resume => format!("Resume({pid})"),
        NativeOp::Efficiency(on) => format!("Efficiency({pid}, ${on})"),
    };
    format!("$ErrorActionPreference = 'Stop'\n{WINDOWS_NATIVE}[TaskManagerLiteNative]::{call}\n")
}

pub fn linux_signal_args(pid: u32, suspend: bool) -> [String; 2] {
    [
        if suspend { "-STOP" } else { "-CONT" }.to_owned(),
        pid.to_string(),
    ]
}

pub fn linux_efficiency(pid: u32, on: bool) -> (Priority, [String; 4]) {
    let priority = if on { Priority::Low } else { Priority::Normal };
    let policy = if on { "--idle" } else { "--other" };
    (
        priority,
        [
            policy.to_owned(),
            "-p".to_owned(),
            "0".to_owned(),
            pid.to_string(),
        ],
    )
}

const DENIED: &str = "変更できませんでした。権限が足りない可能性があります（管理者として実行すると変えられることがあります）。";

/// 今の優先度と関係。読めないものは `None`。
#[cfg(windows)]
pub fn controls(pid: u32) -> ProcessControls {
    crate::powershell::run(&windows_read_script(pid), "").map_or(
        ProcessControls {
            priority: None,
            affinity: None,
        },
        |out| parse_windows_read(&out),
    )
}

#[cfg(windows)]
pub fn set_priority(pid: u32, priority: Priority) -> Result<(), String> {
    crate::powershell::run(&windows_priority_script(pid, priority), "")
        .map(|_| ())
        .map_err(|_| DENIED.to_owned())
}

#[cfg(windows)]
pub fn set_affinity(pid: u32, mask: u64) -> Result<(), String> {
    crate::powershell::run(&windows_affinity_script(pid, mask), "")
        .map(|_| ())
        .map_err(|_| DENIED.to_owned())
}

#[cfg(windows)]
fn native(pid: u32, op: NativeOp) -> Result<(), String> {
    crate::powershell::run_encoded(&windows_native_script(pid, op), "")
        .map(|_| ())
        .map_err(|_| DENIED.to_owned())
}

#[cfg(windows)]
pub fn suspend(pid: u32) -> Result<(), String> {
    native(pid, NativeOp::Suspend)
}

#[cfg(windows)]
pub fn resume(pid: u32) -> Result<(), String> {
    native(pid, NativeOp::Resume)
}

#[cfg(windows)]
pub fn set_efficiency(pid: u32, on: bool) -> Result<(), String> {
    native(pid, NativeOp::Efficiency(on))
}

/// 今の優先度と関係。読めないものは `None`。
#[cfg(not(windows))]
pub fn controls(pid: u32) -> ProcessControls {
    let read = |name: &str| std::fs::read_to_string(format!("/proc/{pid}/{name}")).ok();
    ProcessControls {
        priority: read("stat")
            .and_then(|s| nice_from_proc_stat(&s))
            .map(priority_from_nice),
        affinity: read("status")
            .and_then(|s| mask_from_proc_status(&s))
            .map(cpus_from_mask),
    }
}

#[cfg(not(windows))]
fn run_tool(program: &str, args: &[String]) -> Result<(), String> {
    match std::process::Command::new(program).args(args).output() {
        Ok(out) if out.status.success() => Ok(()),
        Ok(_) => Err(DENIED.to_owned()),
        Err(e) => Err(format!("{program} を起動できません: {e}")),
    }
}

/// 優先度を変える（nice 値を下げるには管理者権限が必要）。
#[cfg(not(windows))]
pub fn set_priority(pid: u32, priority: Priority) -> Result<(), String> {
    let args = [
        "-n".to_owned(),
        nice_of(priority).to_string(),
        "-p".to_owned(),
        pid.to_string(),
    ];
    run_tool("renice", &args)
}

#[cfg(not(windows))]
pub fn set_affinity(pid: u32, mask: u64) -> Result<(), String> {
    run_tool(
        "taskset",
        &["-p".to_owned(), format!("{mask:x}"), pid.to_string()],
    )
}

#[cfg(not(windows))]
pub fn suspend(pid: u32) -> Result<(), String> {
    run_tool("kill", &linux_signal_args(pid, true))
}

#[cfg(not(windows))]
pub fn resume(pid: u32) -> Result<(), String> {
    run_tool("kill", &linux_signal_args(pid, false))
}

#[cfg(not(windows))]
pub fn set_efficiency(pid: u32, on: bool) -> Result<(), String> {
    let (priority, chrt) = linux_efficiency(pid, on);
    set_priority(pid, priority)?;
    let _ = run_tool("chrt", &chrt);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const STAT: &str =
        "1234 (my (odd) app) S 1 1234 1234 0 -1 4194560 100 0 0 0 5 3 0 0 20 -5 4 0 100 0 0";

    mod equivalence {
        use super::*;

        #[test]
        fn cpus_and_mask_roundtrip() {
            assert_eq!(mask_from_cpus(&[0, 2, 63]), Ok(1 | 4 | (1 << 63)));
            assert_eq!(cpus_from_mask(1 | 4 | (1 << 63)), vec![0, 2, 63]);
        }

        #[test]
        fn windows_class_names_roundtrip() {
            for p in Priority::ALL {
                assert_eq!(priority_from_windows_class(windows_class(p)), Some(p));
            }
            assert_eq!(
                priority_from_windows_class("realtime"),
                Some(Priority::Realtime)
            );
        }

        #[test]
        fn nice_values_map_back_to_same_priority() {
            for p in Priority::ALL {
                assert_eq!(priority_from_nice(nice_of(p)), p);
            }
        }

        #[test]
        fn nice_is_read_after_last_parenthesis() {
            assert_eq!(nice_from_proc_stat(STAT), Some(-5));
        }

        #[test]
        fn cpus_allowed_is_read_as_hex() {
            let status = "Name:\tbash\nCpus_allowed:\tf\nCpus_allowed_list:\t0-3\n";
            assert_eq!(mask_from_proc_status(status), Some(0xf));
        }

        #[test]
        fn windows_read_output_is_parsed() {
            let c = parse_windows_read("AboveNormal 5\r\n");
            assert_eq!(c.priority, Some(Priority::AboveNormal));
            assert_eq!(c.affinity, Some(vec![0, 2]));
        }

        #[test]
        fn windows_scripts_use_class_and_signed_mask() {
            assert!(windows_priority_script(8, Priority::Low).ends_with("PriorityClass = 'Idle'"));
            assert!(windows_affinity_script(8, u64::MAX).ends_with("[int64]-1"));
            assert!(windows_read_script(8).contains("Get-Process -Id 8;"));
        }

        #[test]
        fn native_script_calls_one_operation_after_loading_helper() {
            let script = windows_native_script(42, NativeOp::Suspend);
            assert!(script.starts_with("$ErrorActionPreference = 'Stop'\n"));
            assert!(script.ends_with("[TaskManagerLiteNative]::Suspend(42)\n"));
            assert!(windows_native_script(7, NativeOp::Resume).contains("::Resume(7)"));
            assert!(
                windows_native_script(7, NativeOp::Efficiency(true))
                    .contains("::Efficiency(7, $true)")
            );
            assert!(
                windows_native_script(7, NativeOp::Efficiency(false))
                    .contains("::Efficiency(7, $false)")
            );
        }

        // PowerShell のヒアストリングは、閉じる '@ が行の先頭にないと閉じない
        #[test]
        fn native_helper_here_string_closes_at_line_start() {
            assert!(WINDOWS_NATIVE.starts_with("Add-Type -TypeDefinition @'\n"));
            assert!(WINDOWS_NATIVE.ends_with("\n'@\n"));
        }

        #[test]
        fn linux_suspend_and_resume_send_stop_and_cont() {
            assert_eq!(
                linux_signal_args(9, true),
                ["-STOP".to_owned(), "9".to_owned()]
            );
            assert_eq!(
                linux_signal_args(9, false),
                ["-CONT".to_owned(), "9".to_owned()]
            );
        }

        #[test]
        fn linux_efficiency_lowers_priority_and_uses_idle_policy() {
            let (on, chrt_on) = linux_efficiency(5, true);
            assert_eq!(on, Priority::Low);
            assert_eq!(chrt_on.first().map(String::as_str), Some("--idle"));
            let (off, chrt_off) = linux_efficiency(5, false);
            assert_eq!(off, Priority::Normal);
            assert_eq!(chrt_off.first().map(String::as_str), Some("--other"));
            assert_eq!(chrt_off.last().map(String::as_str), Some("5"));
        }

        #[test]
        fn windows_scripts_are_safe_to_pass() {
            for script in [
                windows_read_script(1),
                windows_priority_script(1, Priority::High),
                windows_affinity_script(1, 3),
            ] {
                assert!(crate::powershell::is_safe_script(&script), "{script}");
            }
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_or_out_of_range_cpus_are_rejected() {
            assert!(mask_from_cpus(&[]).is_err());
            assert!(mask_from_cpus(&[MAX_CPUS]).is_err());
            assert_eq!(mask_from_cpus(&[MAX_CPUS - 1]), Ok(1 << 63));
        }

        #[test]
        fn nice_extremes() {
            assert_eq!(priority_from_nice(-20), Priority::Realtime);
            assert_eq!(priority_from_nice(-15), Priority::Realtime);
            assert_eq!(priority_from_nice(-14), Priority::High);
            assert_eq!(priority_from_nice(19), Priority::Low);
            assert_eq!(priority_from_nice(10), Priority::Low);
        }

        #[test]
        fn broken_proc_files_give_none() {
            assert_eq!(nice_from_proc_stat("1234 (app"), None);
            assert_eq!(nice_from_proc_stat("1234 (app) S 1"), None);
            assert_eq!(mask_from_proc_status("Name:\tbash\n"), None);
        }

        #[test]
        fn more_than_64_cpus_keeps_lowest_64() {
            let status = "Cpus_allowed:\tff,00000000,00000003\n";
            assert_eq!(mask_from_proc_status(status), Some(3));
        }

        #[test]
        fn unknown_windows_output_gives_none() {
            let c = parse_windows_read("");
            assert_eq!(c.priority, None);
            assert_eq!(c.affinity, None);
            assert_eq!(parse_windows_read("Weird x").priority, None);
        }

        #[test]
        fn zero_mask_is_no_cpus() {
            assert_eq!(cpus_from_mask(0), Vec::<u32>::new());
        }
    }

    mod property {
        use super::*;
        use proptest::prelude::*;

        fn rank(p: Priority) -> usize {
            Priority::ALL.iter().position(|q| *q == p).unwrap()
        }

        proptest! {
            /// CPU の番号 → ビット → 番号 で、重なりを除いて小さい順に並んだものに戻る
            #[test]
            fn cpus_roundtrip_through_mask(cpus in proptest::collection::vec(0u32..MAX_CPUS, 1..40)) {
                let mut expected = cpus.clone();
                expected.sort_unstable();
                expected.dedup();
                prop_assert_eq!(cpus_from_mask(mask_from_cpus(&cpus).unwrap()), expected);
            }

            /// nice 値が大きい（優先されない）ほど、優先度は同じか低くなる
            #[test]
            fn priority_falls_as_nice_rises(a in -20i32..=19, b in -20i32..=19) {
                let (low, high) = (a.min(b), a.max(b));
                prop_assert!(rank(priority_from_nice(low)) <= rank(priority_from_nice(high)));
            }

            /// プロセス名に空白や括弧が入っていても、nice 値を読み違えない
            #[test]
            fn nice_is_found_whatever_the_name(name in "[^\\n]{0,30}", nice in -20i32..=19) {
                let stat = format!("12 ({name}) S 1 12 12 0 -1 0 0 0 0 0 0 0 0 0 20 {nice} 1 0 100");
                prop_assert_eq!(nice_from_proc_stat(&stat), Some(nice));
            }
        }
    }
}
