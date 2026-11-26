//! プロセスの優先度と関係（動かしてよい CPU）の読み書き。
//! 変えてよいかは状態機械が決める（[`crate::machine::ProcessAction`]）。ここは OS ごとのやり方だけを持つ。
//! - Windows: PowerShell（`Get-Process` の `PriorityClass` と `ProcessorAffinity`）
//! - Linux: 読むのは `/proc`、変えるのは `renice` と `taskset`

use crate::model::{Priority, ProcessControls};

/// 関係で指定できる CPU の数（ビットの並びの長さ）。
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

/// ビットの並びを CPU の番号の並びにする。
pub fn cpus_from_mask(mask: u64) -> Vec<u32> {
    (0..MAX_CPUS).filter(|i| mask & (1u64 << i) != 0).collect()
}

/// Windows の優先度クラスの名前。
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

/// Windows の優先度クラスの名前を読む。
pub fn priority_from_windows_class(name: &str) -> Option<Priority> {
    Priority::ALL
        .into_iter()
        .find(|p| windows_class(*p).eq_ignore_ascii_case(name.trim()))
}

/// Linux の nice 値（小さいほど優先）。
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

/// nice 値をいちばん近い優先度にする。
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

/// Windows: 今の優先度と関係を 1 行で書き出すスクリプト。
pub fn windows_read_script(pid: u32) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'; $p = Get-Process -Id {pid}; [Console]::Out.WriteLine(('{{0}} {{1}}' -f $p.PriorityClass, [int64]$p.ProcessorAffinity))"
    )
}

/// Windows: 読み出しスクリプトの出力を読む。
pub fn parse_windows_read(output: &str) -> ProcessControls {
    let mut parts = output.split_whitespace();
    let priority = parts.next().and_then(priority_from_windows_class);
    let affinity = parts
        .next()
        .and_then(|m| m.parse::<i64>().ok())
        .map(|m| cpus_from_mask(m.cast_unsigned()));
    ProcessControls { priority, affinity }
}

/// Windows: 優先度を変えるスクリプト。
pub fn windows_priority_script(pid: u32, priority: Priority) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'; (Get-Process -Id {pid}).PriorityClass = '{}'",
        windows_class(priority)
    )
}

/// Windows: 関係を変えるスクリプト。
pub fn windows_affinity_script(pid: u32, mask: u64) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'; (Get-Process -Id {pid}).ProcessorAffinity = [IntPtr][int64]{}",
        mask.cast_signed()
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

/// 優先度を変える。
#[cfg(windows)]
pub fn set_priority(pid: u32, priority: Priority) -> Result<(), String> {
    crate::powershell::run(&windows_priority_script(pid, priority), "")
        .map(|_| ())
        .map_err(|_| DENIED.to_owned())
}

/// 関係を変える。
#[cfg(windows)]
pub fn set_affinity(pid: u32, mask: u64) -> Result<(), String> {
    crate::powershell::run(&windows_affinity_script(pid, mask), "")
        .map(|_| ())
        .map_err(|_| DENIED.to_owned())
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

/// 関係を変える。
#[cfg(not(windows))]
pub fn set_affinity(pid: u32, mask: u64) -> Result<(), String> {
    run_tool(
        "taskset",
        &["-p".to_owned(), format!("{mask:x}"), pid.to_string()],
    )
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
}
