//! Windows: PowerShell（System.Drawing）で実行ファイルのアイコンを PNG にして取り出す。
//! 依存を増やさず、unsafe も使わないための方法。場所は標準入力で 1 行ずつ渡す（スクリプトに埋め込まない）。

use std::io::Write;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};

use super::script::{SCRIPT, parse_output};

/// 子プロセスのコンソール画面を出さない。
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(super) fn load(exes: &[String]) -> Vec<Option<String>> {
    run(exes).unwrap_or_else(|| vec![None; exes.len()])
}

fn run(exes: &[String]) -> Option<Vec<Option<String>>> {
    let mut child = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", SCRIPT])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    {
        let mut stdin = child.stdin.take()?;
        stdin.write_all(exes.join("\n").as_bytes()).ok()?;
    }
    let output = child.wait_with_output().ok()?;
    let text = String::from_utf8(output.stdout).ok()?;
    parse_output(&text, exes.len())
}
