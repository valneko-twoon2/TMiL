const MAX_COMMAND_CHARS: usize = 2048;

/// 入力を「起動するもの」と「引数」に分ける。空や改行などの制御文字を含むものは受け付けない。
///
/// - `"C:\Program Files\App\app.exe" --min` → (`C:\Program Files\App\app.exe`, `--min`)
/// - `notepad C:\a.txt` → (`notepad`, `C:\a.txt`)
/// - `C:\Program Files\App\app.exe /x`（引用符なし）→ `.exe` までを 1 つとみなす
pub fn parse_command(command: &str) -> Result<(String, String), String> {
    let text = command.trim();
    if text.is_empty() {
        return Err(
            "開くプログラム、フォルダー、ドキュメント、またはインターネット リソースの名前を入力してください。"
                .to_owned(),
        );
    }
    if text.chars().any(char::is_control) {
        return Err("改行などの制御文字は使えません。".to_owned());
    }
    if text.chars().count() > MAX_COMMAND_CHARS {
        return Err("入力が長すぎます。".to_owned());
    }
    let program = crate::startup::command::program_of(text);
    if program.is_empty() {
        return Err("起動するものの名前が分かりません。".to_owned());
    }
    let rest = if let Some(quoted) = text.strip_prefix('"') {
        quoted.get(program.len() + 1..).unwrap_or_default()
    } else {
        text.get(program.len()..).unwrap_or_default()
    };
    Ok((program.to_owned(), rest.trim().to_owned()))
}

/// Windows: 標準入力の 1 行目を起動し、2 行目を引数として渡すスクリプト。
pub fn windows_script(admin: bool) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'; \
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false); \
$lines = [Console]::In.ReadToEnd().Split([char]10); \
$options = @{{ FilePath = $lines[0] }}; \
if ($lines.Length -gt 1 -and $lines[1]) {{ $options.ArgumentList = $lines[1] }}; \
if (${admin}) {{ $options.Verb = 'RunAs' }}; \
Start-Process @options"
    )
}

pub fn failure_message(program: &str, admin: bool) -> String {
    if admin {
        format!(
            "'{program}' を管理者として起動できませんでした。名前が正しいか、管理者の確認が取り消されていないかを確かめてください。"
        )
    } else {
        format!(
            "'{program}' が見つかりません。名前を正しく入力したかどうかを確認してから、やり直してください。"
        )
    }
}

/// 入力は `$0`（コマンド全体）と `$1`（起動するもの）で受け取り、スクリプトには埋め込まない。
pub fn linux_script(admin: bool) -> &'static str {
    if admin {
        "command -v pkexec >/dev/null 2>&1 || exit 126; command -v -- \"$1\" >/dev/null 2>&1 || exit 127; \
nohup pkexec sh -c \"$0\" >/dev/null 2>&1 &"
    } else {
        "command -v -- \"$1\" >/dev/null 2>&1 || exit 127; nohup sh -c \"$0\" >/dev/null 2>&1 &"
    }
}

#[cfg(windows)]
pub fn run(command: &str, admin: bool) -> Result<(), String> {
    let (program, arguments) = parse_command(command)?;
    crate::powershell::run(&windows_script(admin), &format!("{program}\n{arguments}"))
        .map(|_| ())
        .map_err(|_| failure_message(&program, admin))
}

#[cfg(not(windows))]
pub fn run(command: &str, admin: bool) -> Result<(), String> {
    let (program, _) = parse_command(command)?;
    let status = std::process::Command::new("sh")
        .args(["-c", linux_script(admin), command.trim(), &program])
        .status()
        .map_err(|e| format!("sh を起動できません: {e}"))?;
    match status.code() {
        Some(0) => Ok(()),
        Some(126) => Err("管理者として起動するには pkexec が必要です。".to_owned()),
        _ => Err(failure_message(&program, admin)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(command: &str) -> (String, String) {
        parse_command(command).unwrap()
    }

    mod equivalence {
        use super::*;

        #[test]
        fn quoted_program_and_arguments_are_split() {
            assert_eq!(
                parsed(r#""C:\Program Files\App\app.exe" --min "a b""#),
                (
                    r"C:\Program Files\App\app.exe".to_owned(),
                    r#"--min "a b""#.to_owned()
                )
            );
        }

        #[test]
        fn plain_name_and_arguments_are_split_at_first_space() {
            assert_eq!(
                parsed(r"notepad C:\a.txt"),
                ("notepad".to_owned(), r"C:\a.txt".to_owned())
            );
            assert_eq!(parsed("cmd"), ("cmd".to_owned(), String::new()));
        }

        #[test]
        fn unquoted_path_with_spaces_ends_at_exe() {
            assert_eq!(
                parsed(r"C:\Program Files\App\app.exe /x"),
                (r"C:\Program Files\App\app.exe".to_owned(), "/x".to_owned())
            );
        }

        #[test]
        fn windows_script_reads_input_and_elevates_only_when_asked() {
            let plain = windows_script(false);
            assert!(plain.contains("if ($false)"));
            assert!(windows_script(true).contains("if ($true)"));
            assert!(plain.contains("[Console]::In.ReadToEnd()"));
            assert!(crate::powershell::is_safe_script(&plain));
        }

        #[test]
        fn linux_script_takes_input_as_parameters() {
            for admin in [false, true] {
                let script = linux_script(admin);
                assert!(script.contains("sh -c \"$0\""));
                assert!(script.contains("command -v -- \"$1\""));
            }
            assert!(linux_script(true).contains("pkexec"));
            assert!(!linux_script(false).contains("pkexec"));
        }

        #[test]
        fn failure_message_names_the_program() {
            assert!(failure_message("abc", false).contains("'abc' が見つかりません"));
            assert!(failure_message("abc", true).contains("管理者"));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_or_blank_input_is_rejected() {
            assert!(parse_command("").is_err());
            assert!(parse_command("   ").is_err());
            assert!(parse_command("\"\"").is_err());
        }

        #[test]
        fn control_characters_are_rejected() {
            assert!(parse_command("notepad\nevil").is_err());
            assert!(parse_command("a\tb").is_err());
        }

        #[test]
        fn length_limit_is_inclusive() {
            assert!(parse_command(&"a".repeat(MAX_COMMAND_CHARS)).is_ok());
            assert!(parse_command(&"a".repeat(MAX_COMMAND_CHARS + 1)).is_err());
        }

        #[test]
        fn unclosed_quote_takes_everything_as_program() {
            assert_eq!(
                parsed(r#""C:\a b\app.exe"#),
                (r"C:\a b\app.exe".to_owned(), String::new())
            );
        }
    }

    mod property {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// 引用符で囲んだものは、中に空白があってもそのまま起動するものになる
            #[test]
            fn quoted_program_is_kept_whole(
                program in "[A-Za-z0-9 :\\\\._-]{1,40}",
                args in "[A-Za-z0-9 /-]{0,20}",
            ) {
                prop_assume!(!program.trim().is_empty());
                let (p, a) = parse_command(&format!("\"{program}\" {args}")).unwrap();
                prop_assert_eq!(p, program);
                prop_assert_eq!(a, args.trim());
            }
        }
    }
}
