//! Windows のタスク マネージャーを TMiL に置き換える設定。
//!
//! タスクバーの右クリックメニューに独自の項目は足せないため、Process Explorer と同じく
//! Image File Execution Options の `Debugger` 値で `taskmgr.exe` の起動先を差し替える。
//! これでメニューの「タスク マネージャー」や Ctrl+Shift+Esc から TMiL が開く。
//! HKLM への書き込みになるので、`reg.exe` を管理者として起動する。

use std::path::Path;

use crate::model::ReplacementStatus;

/// 置き換え設定を書き込むレジストリキー（HKLM）。
pub const IFEO_KEY: &str =
    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe";

/// `Debugger` に書き込む値。
pub fn debugger_value(exe: &Path) -> String {
    format!("\"{}\"", exe.display())
}

fn normalize(value: &str) -> String {
    value.trim().trim_matches('"').to_lowercase()
}

/// 現在の `Debugger` 値から状態を判定する。
pub fn evaluate(current: Option<&str>, exe: &Path) -> ReplacementStatus {
    let current = current.map(str::trim).filter(|v| !v.is_empty());
    let replaced = current.is_some_and(|v| normalize(v) == normalize(&debugger_value(exe)));
    ReplacementStatus {
        supported: true,
        replaced,
        other: current.filter(|_| !replaced).map(str::to_owned),
    }
}

/// Windows のコマンドライン引数 1 つ分をクォートする（`CommandLineToArgvW` の規則）。
pub fn quote_windows_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '\n', '"']) {
        return arg.to_owned();
    }
    let mut out = String::from("\"");
    let mut backslashes = 0usize;
    for c in arg.chars() {
        match c {
            '\\' => backslashes += 1,
            '"' => {
                out.push_str(&"\\".repeat(backslashes * 2 + 1));
                out.push('"');
                backslashes = 0;
            }
            _ => {
                out.push_str(&"\\".repeat(backslashes));
                out.push(c);
                backslashes = 0;
            }
        }
    }
    out.push_str(&"\\".repeat(backslashes * 2));
    out.push('"');
    out
}

/// `reg.exe` に渡す引数。
pub fn reg_args(enable: bool, exe: &Path) -> Vec<String> {
    let key = format!(r"HKLM\{IFEO_KEY}");
    if enable {
        vec![
            "add".to_owned(),
            key,
            "/v".to_owned(),
            "Debugger".to_owned(),
            "/t".to_owned(),
            "REG_SZ".to_owned(),
            "/d".to_owned(),
            debugger_value(exe),
            "/f".to_owned(),
        ]
    } else {
        vec![
            "delete".to_owned(),
            key,
            "/v".to_owned(),
            "Debugger".to_owned(),
            "/f".to_owned(),
        ]
    }
}

/// `reg.exe` を管理者として起動する PowerShell スクリプト。終了コードを引き継ぐ。
pub fn elevate_script(args: &[String]) -> String {
    let line = args
        .iter()
        .map(|a| quote_windows_arg(a))
        .collect::<Vec<_>>()
        .join(" ");
    let quoted = line.replace('\'', "''");
    format!(
        "$p = Start-Process -FilePath 'reg.exe' -ArgumentList '{quoted}' -Verb RunAs -Wait -WindowStyle Hidden -PassThru; exit $p.ExitCode"
    )
}

/// 現在の状態を返す。
#[cfg(windows)]
pub fn status(exe: &Path) -> ReplacementStatus {
    let current = crate::startup::win_registry::read_machine_string(IFEO_KEY, "Debugger");
    evaluate(current.as_deref(), exe)
}

/// 置き換えを有効・無効にする（UAC の確認が出る）。
#[cfg(windows)]
pub fn set(exe: &Path, enable: bool) -> Result<ReplacementStatus, String> {
    let script = elevate_script(&reg_args(enable, exe));
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| format!("PowerShell を起動できません: {e}"))?;
    if !output.status.success() {
        return Err(
            "設定を変更できませんでした（管理者の確認が取り消された可能性があります）。".to_owned(),
        );
    }
    Ok(status(exe))
}

/// Windows 以外では使えない。
#[cfg(not(windows))]
pub fn status(_exe: &Path) -> ReplacementStatus {
    ReplacementStatus {
        supported: false,
        replaced: false,
        other: None,
    }
}

/// Windows 以外では使えない。
#[cfg(not(windows))]
pub fn set(_exe: &Path, _enable: bool) -> Result<ReplacementStatus, String> {
    Err("この機能は Windows でのみ使えます。".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn exe() -> PathBuf {
        PathBuf::from(r"C:\Program Files\TMiL\tmil.exe")
    }

    mod equivalence {
        use super::*;

        #[test]
        fn debugger_value_is_quoted_path() {
            assert_eq!(
                debugger_value(&exe()),
                r#""C:\Program Files\TMiL\tmil.exe""#
            );
        }

        #[test]
        fn evaluate_detects_our_value_case_insensitively() {
            let s = evaluate(Some(r#""c:\program files\tmil\TMIL.exe""#), &exe());
            assert!(s.replaced);
            assert_eq!(s.other, None);
        }

        #[test]
        fn evaluate_reports_other_tool() {
            let s = evaluate(Some(r"C:\Tools\procexp.exe"), &exe());
            assert!(!s.replaced);
            assert_eq!(s.other.as_deref(), Some(r"C:\Tools\procexp.exe"));
        }

        #[test]
        fn reg_args_for_enable_and_disable() {
            let add = reg_args(true, &exe());
            assert_eq!(add[0], "add");
            assert!(add.contains(&debugger_value(&exe())));
            let del = reg_args(false, &exe());
            assert_eq!(del[0], "delete");
            assert!(!del.contains(&"/d".to_owned()));
        }

        #[test]
        fn quote_plain_and_spaced_args() {
            assert_eq!(quote_windows_arg("add"), "add");
            assert_eq!(quote_windows_arg("a b"), r#""a b""#);
            assert_eq!(
                quote_windows_arg(r#""C:\x y\a.exe""#),
                r#""\"C:\x y\a.exe\"""#
            );
        }

        #[test]
        fn elevate_script_escapes_single_quotes() {
            let script = elevate_script(&["add".to_owned(), "it's".to_owned()]);
            assert!(script.contains("-ArgumentList 'add it''s'"));
            assert!(script.contains("-Verb RunAs"));
        }

        #[test]
        fn status_on_non_windows_is_unsupported() {
            if cfg!(not(windows)) {
                assert!(!status(&exe()).supported);
                assert!(set(&exe(), true).is_err());
            }
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn evaluate_missing_or_blank_value() {
            for v in [None, Some(""), Some("   ")] {
                let s = evaluate(v, &exe());
                assert!(!s.replaced);
                assert_eq!(s.other, None);
            }
        }

        #[test]
        fn quote_empty_arg() {
            assert_eq!(quote_windows_arg(""), r#""""#);
        }

        #[test]
        fn quote_trailing_backslashes_before_closing_quote() {
            assert_eq!(quote_windows_arg(r"C:\a b\"), r#""C:\a b\\""#);
        }

        #[test]
        fn quote_backslashes_before_inner_quote() {
            assert_eq!(quote_windows_arg(r#"a\"b"#), r#""a\\\"b""#);
        }
    }
}
