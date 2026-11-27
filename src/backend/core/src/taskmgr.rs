//! タスクバーの右クリックメニューに独自の項目は足せないため、Process Explorer と同じく
//! Image File Execution Options の `Debugger` 値で `taskmgr.exe` の起動先を差し替える。
//! これでメニューの「タスク マネージャー」や Ctrl+Shift+Esc から TaskManagerLite が開く。
//! HKLM への書き込みになるので、`reg.exe` を管理者として起動する。

use std::path::Path;

use crate::model::ReplacementStatus;

pub const IFEO_KEY: &str =
    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe";

pub fn debugger_value(exe: &Path) -> String {
    format!("\"{}\"", exe.display())
}

fn normalize(value: &str) -> String {
    value.trim().trim_matches('"').to_lowercase()
}

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

/// `quote_windows_arg` の逆変換。引用符の外に区切り（空白・タブ）があり、
/// 2 つ以上の引数に分かれてしまう場合は `None` を返す。
pub fn unquote_windows_arg(text: &str) -> Option<String> {
    let mut out = String::new();
    let mut in_quotes = false;
    let mut backslashes = 0usize;
    for c in text.chars() {
        match c {
            '\\' => backslashes += 1,
            '"' => {
                out.push_str(&"\\".repeat(backslashes / 2));
                if backslashes % 2 == 1 {
                    out.push('"');
                } else {
                    in_quotes = !in_quotes;
                }
                backslashes = 0;
            }
            ' ' | '\t' if !in_quotes => return None,
            _ => {
                out.push_str(&"\\".repeat(backslashes));
                out.push(c);
                backslashes = 0;
            }
        }
    }
    out.push_str(&"\\".repeat(backslashes));
    Some(out)
}

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

pub fn elevate_script(args: &[String]) -> String {
    let line = args
        .iter()
        .map(|a| quote_windows_arg(a))
        .collect::<Vec<_>>()
        .join(" ");
    let quoted = line.replace('\'', "''");
    // UAC で取り消されると Start-Process が失敗する。Stop にして終了コード 1 で抜けさせる
    format!(
        "$ErrorActionPreference = 'Stop'; $p = Start-Process -FilePath 'reg.exe' -ArgumentList '{quoted}' -Verb RunAs -Wait -WindowStyle Hidden -PassThru; exit $p.ExitCode"
    )
}

#[cfg(windows)]
pub fn status(exe: &Path) -> ReplacementStatus {
    let current = crate::startup::win_registry::read_machine_string(IFEO_KEY, "Debugger");
    evaluate(current.as_deref(), exe)
}

#[cfg(windows)]
pub fn elevate(exe: &Path, enable: bool) -> Result<(), String> {
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
    Ok(())
}

#[cfg(not(windows))]
pub fn status(_exe: &Path) -> ReplacementStatus {
    ReplacementStatus {
        supported: false,
        replaced: false,
        other: None,
    }
}

#[cfg(not(windows))]
pub fn elevate(_exe: &Path, _enable: bool) -> Result<(), String> {
    Err("この機能は Windows でのみ使えます。".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn exe() -> PathBuf {
        PathBuf::from(r"C:\Program Files\TaskManagerLite\taskmanagerlite.exe")
    }

    mod equivalence {
        use super::*;

        #[test]
        fn debugger_value_is_quoted_path() {
            assert_eq!(
                debugger_value(&exe()),
                r#""C:\Program Files\TaskManagerLite\taskmanagerlite.exe""#
            );
        }

        #[test]
        fn evaluate_detects_our_value_case_insensitively() {
            let s = evaluate(
                Some(r#""c:\program files\taskmanagerlite\TASKMANAGERLITE.exe""#),
                &exe(),
            );
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
                assert!(elevate(&exe(), true).is_err());
            }
        }
    }

    mod regression {
        use super::*;

        /// 置き換えたままアンインストールすると、タスク マネージャーが開かなくなっていた。
        /// インストーラーのフックが同じキーを消すことを確かめる。
        #[test]
        fn uninstaller_hook_removes_the_same_key() {
            let hook = include_str!("../../app/nsis/hooks.nsh");
            assert!(hook.contains("NSIS_HOOK_PREUNINSTALL"));
            assert!(hook.contains(IFEO_KEY), "フックのキーが IFEO_KEY と違う");
            assert!(hook.contains(&format!(r#"delete "HKLM\{IFEO_KEY}" /v Debugger"#)));
            // 書き込む値（"<exe>"）と同じ形で比べている
            assert!(hook.contains(r#"'"$INSTDIR\${MAINBINARYNAME}.exe"'"#));
        }

        /// UAC で「いいえ」を押すと Start-Process が失敗するが、終了コード 0 で抜けて成功扱いになっていた。
        #[test]
        fn elevate_script_fails_when_start_process_fails() {
            let script = elevate_script(&["add".to_owned()]);
            assert!(
                script.starts_with("$ErrorActionPreference = 'Stop';"),
                "{script}"
            );
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

        #[test]
        fn unquote_rejects_unquoted_separator() {
            assert_eq!(unquote_windows_arg("a b"), None);
            assert_eq!(unquote_windows_arg("a\tb"), None);
        }

        #[test]
        fn unquote_plain_and_trailing_backslashes() {
            assert_eq!(unquote_windows_arg(""), Some(String::new()));
            assert_eq!(unquote_windows_arg(r"a\\"), Some(r"a\\".to_owned()));
            assert_eq!(
                unquote_windows_arg(r#""a\\\"b""#),
                Some(r#"a\"b"#.to_owned())
            );
        }
    }

    /// 乱数で作った文字列をクォートして読み戻し、元に戻ることを確かめる（簡易ファジング）。
    /// 本格的なファジングは tests/fuzz（cargo-fuzz）で行う。
    mod fuzz {
        use super::*;

        #[test]
        fn quote_roundtrips_random_strings() {
            let alphabet: Vec<char> = "ab \t\\\"\n'é漢\u{3000}".chars().collect();
            let mut state: u64 = 0x2545_F491_4F6C_DD1D;
            for _ in 0..5000 {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                let len = usize::try_from(state % 16).unwrap();
                let text: String = (0..len)
                    .map(|i| {
                        let shift = u32::try_from(i % 8).unwrap() * 8;
                        alphabet[usize::try_from((state >> shift) & 0xFF).unwrap() % alphabet.len()]
                    })
                    .collect();
                assert_eq!(
                    unquote_windows_arg(&quote_windows_arg(&text)),
                    Some(text.clone()),
                    "{text:?}"
                );
            }
        }
    }

    mod property {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// どんな文字列もクォートして戻すと元に戻る（コマンドラインの組み立てを間違えない）
            #[test]
            fn quoting_roundtrips(arg in "[^\\x00]{0,40}") {
                prop_assert_eq!(unquote_windows_arg(&quote_windows_arg(&arg)), Some(arg));
            }
        }
    }
}
