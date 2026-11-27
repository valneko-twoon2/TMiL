//! Windows で PowerShell を画面を出さずに動かす（アイコンの取り出しや、優先度・関係の変更に使う）。
//! [`run`] はスクリプトを `-Command` の引数として渡すので、二重引用符を含めない（引数の区切りと混ざるため）。
//! 二重引用符や改行が要るスクリプト（C# を埋め込むものなど）は [`run_encoded`] で渡す。

#[cfg(windows)]
use std::io::Write;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use std::process::{Command, Stdio};

/// 子プロセスのコンソール画面を出さない。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// スクリプトとして渡してよいか（二重引用符と改行は使わない）。
pub fn is_safe_script(script: &str) -> bool {
    !script.contains(['"', '\n', '\r'])
}

/// `-EncodedCommand` に渡す形（UTF-16LE を Base64 にしたもの）。どんな文字でもそのまま渡せる。
pub fn encode_command(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    crate::base64::encode(&bytes)
}

/// スクリプトを動かし、標準出力を返す。失敗したら標準エラーの内容を返す。
#[cfg(windows)]
pub fn run(script: &str, stdin: &str) -> Result<String, String> {
    if !is_safe_script(script) {
        return Err("内部エラー: スクリプトに使えない文字があります。".to_owned());
    }
    spawn(&["-Command", script], stdin)
}

/// どんな文字を含むスクリプトでも動かす（`-EncodedCommand` で渡す）。
#[cfg(windows)]
pub fn run_encoded(script: &str, stdin: &str) -> Result<String, String> {
    spawn(&["-EncodedCommand", &encode_command(script)], stdin)
}

#[cfg(windows)]
fn spawn(args: &[&str], stdin: &str) -> Result<String, String> {
    let mut child = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive"])
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("PowerShell を起動できません: {e}"))?;
    if let Some(mut input) = child.stdin.take() {
        input
            .write_all(stdin.as_bytes())
            .map_err(|e| format!("PowerShell に渡せません: {e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("PowerShell の結果を読めません: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn encoded_command_is_utf16le_base64() {
            // "a" は UTF-16LE で 61 00
            assert_eq!(encode_command("a"), "YQA=");
            // 日本語も 2 バイトずつ（「あ」は U+3042 → 42 30）
            assert_eq!(encode_command("あ"), "QjA=");
        }

        #[test]
        fn single_quoted_one_line_script_is_safe() {
            assert!(is_safe_script(
                "$p = Get-Process -Id 4; $p.PriorityClass = 'High'"
            ));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_script_encodes_to_empty() {
            assert_eq!(encode_command(""), "");
        }

        #[test]
        fn double_quotes_and_newlines_are_rejected() {
            assert!(!is_safe_script("Write-Output \"x\""));
            assert!(!is_safe_script("a\nb"));
        }
    }
}
