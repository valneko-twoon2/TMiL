//! Windows: PowerShell（System.Drawing）で実行ファイルのアイコンを PNG にして取り出す。
//! 依存を増やさず、unsafe も使わないための方法。場所は標準入力で 1 行ずつ渡す（スクリプトに埋め込まない）。

use super::script::{SCRIPT, parse_output};

pub(super) fn load(exes: &[String]) -> Vec<Option<String>> {
    crate::powershell::run(SCRIPT, &exes.join("\n"))
        .ok()
        .and_then(|text| parse_output(&text, exes.len()))
        .unwrap_or_else(|| vec![None; exes.len()])
}
