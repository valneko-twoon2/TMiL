//! 画面にウィンドウを出しているプロセス（本家の「アプリ」）の一覧と、そのウィンドウへの切り替え。
//!
//! 読むだけか、ほかのアプリを前に出すだけで、状態を持たないので状態機械は通さない。
//! - Windows: PowerShell（`MainWindowHandle` があるプロセス。切り替えは `WScript.Shell` の `AppActivate`）
//! - Linux: `wmctrl -lp`（X11 のウィンドウ一覧。無い環境では空）

use crate::model::AppWindow;

/// Windows: ウィンドウを持つプロセスを「PID タブ タイトル」で 1 行ずつ書くスクリプト。
pub const WINDOWS_SCRIPT: &str = "$ErrorActionPreference = 'SilentlyContinue'; \
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); \
foreach ($p in Get-Process) { \
  if ($p.MainWindowHandle -ne 0) { \
    [Console]::Out.WriteLine([string]$p.Id + [char]9 + ((-split [string]$p.MainWindowTitle) -join ' ')) \
  } \
}";

/// Windows のスクリプトの出力を読む。
pub fn parse_windows(output: &str) -> Vec<AppWindow> {
    output
        .lines()
        .filter_map(|line| {
            let (pid, title) = line.trim_end_matches('\r').split_once('\t')?;
            Some(AppWindow {
                pid: pid.trim().parse().ok()?,
                title: title.trim().to_owned(),
            })
        })
        .collect()
}

/// `wmctrl -lp` の 1 行（ウィンドウ ID・デスクトップ・PID・ホスト・タイトル）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WmctrlLine {
    pub id: String,
    pub pid: u32,
    pub title: String,
}

/// `wmctrl -lp` の出力を読む。パネルなど全デスクトップに出るもの（デスクトップが -1）は除く。
pub fn parse_wmctrl(output: &str) -> Vec<WmctrlLine> {
    output
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let id = parts.next()?;
            let desktop = parts.next()?;
            let pid: u32 = parts.next()?.parse().ok()?;
            let _host = parts.next()?;
            let title = parts.collect::<Vec<_>>().join(" ");
            (desktop != "-1" && pid != 0).then(|| WmctrlLine {
                id: id.to_owned(),
                pid,
                title,
            })
        })
        .collect()
}

/// Windows: そのプロセスのウィンドウを前に出すスクリプト。前に出せなければ終了コード 1。
pub fn windows_switch_script(pid: u32) -> String {
    format!(
        "$shell = New-Object -ComObject WScript.Shell; if (-not $shell.AppActivate({pid})) {{ exit 1 }}"
    )
}

const SWITCH_FAILED: &str =
    "ウィンドウに切り替えられませんでした。アプリがすでに終了している可能性があります。";

/// ウィンドウを持つプロセスの一覧。
#[cfg(windows)]
pub fn list() -> Vec<AppWindow> {
    crate::powershell::run(WINDOWS_SCRIPT, "")
        .map(|out| parse_windows(&out))
        .unwrap_or_default()
}

/// そのプロセスのウィンドウに切り替える。
#[cfg(windows)]
pub fn switch_to(pid: u32) -> Result<(), String> {
    crate::powershell::run(&windows_switch_script(pid), "")
        .map(|_| ())
        .map_err(|_| SWITCH_FAILED.to_owned())
}

#[cfg(not(windows))]
fn wmctrl_lines() -> Vec<WmctrlLine> {
    std::process::Command::new("wmctrl")
        .arg("-lp")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| parse_wmctrl(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default()
}

/// ウィンドウを持つプロセスの一覧（`wmctrl` が無ければ空）。
#[cfg(not(windows))]
pub fn list() -> Vec<AppWindow> {
    wmctrl_lines()
        .into_iter()
        .map(|w| AppWindow {
            pid: w.pid,
            title: w.title,
        })
        .collect()
}

/// そのプロセスのウィンドウに切り替える（`wmctrl` が必要）。
#[cfg(not(windows))]
pub fn switch_to(pid: u32) -> Result<(), String> {
    let window = wmctrl_lines()
        .into_iter()
        .find(|w| w.pid == pid)
        .ok_or_else(|| SWITCH_FAILED.to_owned())?;
    let ok = std::process::Command::new("wmctrl")
        .args(["-i", "-a", &window.id])
        .status()
        .is_ok_and(|s| s.success());
    if ok {
        Ok(())
    } else {
        Err(SWITCH_FAILED.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn windows_lines_have_pid_and_title() {
            let out = "1234\tメモ帳 - 無題\r\n5678\t\r\n";
            assert_eq!(
                parse_windows(out),
                vec![
                    AppWindow {
                        pid: 1234,
                        title: "メモ帳 - 無題".to_owned()
                    },
                    AppWindow {
                        pid: 5678,
                        title: String::new()
                    },
                ]
            );
        }

        #[test]
        fn wmctrl_lines_keep_title_with_spaces_and_skip_panels() {
            let out =
                "0x03a00003  0 4321   host Mozilla Firefox\n0x01000004 -1 900    host Top Panel\n";
            assert_eq!(
                parse_wmctrl(out),
                vec![WmctrlLine {
                    id: "0x03a00003".to_owned(),
                    pid: 4321,
                    title: "Mozilla Firefox".to_owned()
                }]
            );
        }

        #[test]
        fn switch_script_activates_by_pid() {
            let script = windows_switch_script(42);
            assert!(script.contains("AppActivate(42)"));
            assert!(crate::powershell::is_safe_script(&script));
            assert!(crate::powershell::is_safe_script(WINDOWS_SCRIPT));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn broken_lines_are_skipped() {
            assert_eq!(parse_windows("abc\tx\nno tab\n\n"), Vec::new());
            assert_eq!(parse_wmctrl("0x1 0 notpid host t\n0x2 0\n"), Vec::new());
        }

        #[test]
        fn wmctrl_without_pid_is_skipped() {
            assert_eq!(parse_wmctrl("0x1 0 0 host t\n"), Vec::new());
        }

        #[test]
        fn empty_output_is_empty_list() {
            assert_eq!(parse_windows(""), Vec::new());
            assert_eq!(parse_wmctrl(""), Vec::new());
        }
    }
}
