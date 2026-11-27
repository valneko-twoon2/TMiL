use super::ExeDetails;
use super::script::{SCRIPT, parse_output};

pub(super) fn load(exes: &[String]) -> Vec<ExeDetails> {
    crate::powershell::run(SCRIPT, &exes.join("\n"))
        .ok()
        .and_then(|text| parse_output(&text, exes.len()))
        .unwrap_or_else(|| vec![ExeDetails::default(); exes.len()])
}
