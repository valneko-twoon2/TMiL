use super::ExeDetails;
use crate::base64;

/// 標準入力から実行ファイルの場所を 1 行ずつ読み、
/// 「アイコンの PNG（Base64）・ファイルの説明・会社名」をタブ区切りで 1 行ずつ書く。
/// 取り出せなかった項目は空にする（行の数は入力と同じ）。
/// `-Command` の引数として渡すので、二重引用符は使わない（引数の区切りと混ざるため）。
pub const SCRIPT: &str = "$ErrorActionPreference = 'SilentlyContinue'; \
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false); \
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); \
Add-Type -AssemblyName System.Drawing; \
$tab = [string][char]9; \
foreach ($line in [Console]::In.ReadToEnd().Split([char]10)) { \
  $path = $line.Trim(); $data = ''; $description = ''; $company = ''; \
  try { \
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path); \
    if ($icon) { \
      $stream = [IO.MemoryStream]::new(); \
      $icon.ToBitmap().Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); \
      $data = [Convert]::ToBase64String($stream.ToArray()) \
    } \
  } catch {} \
  try { \
    $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($path); \
    $description = (-split [string]$info.FileDescription) -join ' '; \
    $company = (-split [string]$info.CompanyName) -join ' ' \
  } catch {} \
  [Console]::Out.WriteLine($data + $tab + $description + $tab + $company) \
}";

fn text(field: Option<&str>) -> Option<String> {
    field
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_owned)
}

/// スクリプトの出力を読む。行の数が合わなければ `None`（どれがどれか分からない）。
pub fn parse_output(output: &str, expected: usize) -> Option<Vec<ExeDetails>> {
    let lines: Vec<&str> = output.lines().collect();
    if lines.len() != expected {
        return None;
    }
    Some(
        lines
            .into_iter()
            .map(|line| {
                let mut fields = line.trim_end_matches('\r').split('\t');
                let data = fields.next().unwrap_or_default().trim();
                ExeDetails {
                    icon: base64::is_valid(data).then(|| format!("data:image/png;base64,{data}")),
                    description: text(fields.next()),
                    company: text(fields.next()),
                }
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn icon(data: &str) -> String {
        format!("data:image/png;base64,{data}")
    }

    mod equivalence {
        use super::*;

        #[test]
        fn each_line_has_icon_description_and_company() {
            let out = parse_output("Zm9v\tGoogle Chrome\tGoogle LLC\r\n\t\t\r\nYmFy\t\t\r\n", 3);
            assert_eq!(
                out,
                Some(vec![
                    ExeDetails {
                        icon: Some(icon("Zm9v")),
                        description: Some("Google Chrome".to_owned()),
                        company: Some("Google LLC".to_owned()),
                    },
                    ExeDetails::default(),
                    ExeDetails {
                        icon: Some(icon("YmFy")),
                        ..ExeDetails::default()
                    },
                ])
            );
        }

        // 先頭の項目が空でも、ほかの項目がずれない
        #[test]
        fn missing_icon_does_not_shift_other_fields() {
            let out = parse_output("\tメモ帳\tMicrosoft Corporation\n", 1).unwrap();
            assert_eq!(out.first().unwrap().icon, None);
            assert_eq!(out.first().unwrap().description.as_deref(), Some("メモ帳"));
        }

        // 二重引用符があると -Command の引数の区切りと混ざり、スクリプトが壊れる
        #[test]
        fn script_has_no_double_quotes() {
            assert!(!SCRIPT.contains('"'));
            assert!(crate::powershell::is_safe_script(SCRIPT));
        }

        #[test]
        fn script_reads_paths_and_writes_text_as_utf8() {
            assert!(SCRIPT.contains("[Console]::In.ReadToEnd()"));
            assert!(SCRIPT.contains("InputEncoding = [Text.UTF8Encoding]"));
            assert!(SCRIPT.contains("OutputEncoding = [Text.UTF8Encoding]"));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn line_count_mismatch_is_none() {
            assert_eq!(parse_output("Zm9v\n", 2), None);
            assert_eq!(parse_output("", 1), None);
        }

        #[test]
        fn zero_paths_and_empty_output_match() {
            assert_eq!(parse_output("", 0), Some(Vec::new()));
        }

        #[test]
        fn non_base64_output_is_ignored() {
            assert_eq!(
                parse_output("警告: 何か\n", 1),
                Some(vec![ExeDetails::default()])
            );
        }

        #[test]
        fn blank_description_is_none() {
            let out = parse_output("Zm9v\t   \t\n", 1).unwrap();
            assert_eq!(out.first().unwrap().description, None);
            assert_eq!(out.first().unwrap().company, None);
        }
    }
}
