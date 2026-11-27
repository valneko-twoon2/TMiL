//! Windows: PowerShell（System.Drawing と FileVersionInfo）で実行ファイルのアイコンと説明を取り出す。
//! 依存を増やさず、unsafe も使わないための方法。場所は標準入力で 1 行ずつ渡す（スクリプトに埋め込まない）。

use super::ExeDetails;
use super::script::{SCRIPT, parse_output};

pub(super) fn load(exes: &[String]) -> Vec<ExeDetails> {
    crate::powershell::run(SCRIPT, &exes.join("\n"))
        .ok()
        .and_then(|text| parse_output(&text, exes.len()))
        .unwrap_or_else(|| vec![ExeDetails::default(); exes.len()])
}
