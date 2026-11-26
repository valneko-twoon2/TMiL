//! Windows でアイコンを取り出す PowerShell スクリプトと、その出力の読み方（どの OS でもテストできる）。

use super::base64;

/// 標準入力から実行ファイルの場所を 1 行ずつ読み、アイコンの PNG を Base64 で 1 行ずつ書く。
/// 取り出せなかった行は空にする（行の数は入力と同じ）。
/// `-Command` の引数として渡すので、二重引用符は使わない（引数の区切りと混ざるため）。
pub const SCRIPT: &str = "$ErrorActionPreference = 'SilentlyContinue'; \
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false); \
Add-Type -AssemblyName System.Drawing; \
foreach ($line in [Console]::In.ReadToEnd().Split([char]10)) { \
  $data = ''; \
  try { \
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($line.Trim()); \
    if ($icon) { \
      $stream = [IO.MemoryStream]::new(); \
      $icon.ToBitmap().Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); \
      $data = [Convert]::ToBase64String($stream.ToArray()) \
    } \
  } catch {} \
  [Console]::Out.WriteLine($data) \
}";

/// スクリプトの出力を data URL にする。行の数が合わなければ `None`（どれがどれか分からない）。
pub fn parse_output(text: &str, expected: usize) -> Option<Vec<Option<String>>> {
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() != expected {
        return None;
    }
    Some(
        lines
            .into_iter()
            .map(|line| {
                let data = line.trim();
                base64::is_valid(data).then(|| format!("data:image/png;base64,{data}"))
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn each_line_becomes_png_data_url_or_none() {
            let out = parse_output("Zm9v\r\n\r\nYmFy\r\n", 3);
            assert_eq!(
                out,
                Some(vec![
                    Some("data:image/png;base64,Zm9v".to_owned()),
                    None,
                    Some("data:image/png;base64,YmFy".to_owned()),
                ])
            );
        }

        // 二重引用符があると -Command の引数の区切りと混ざり、スクリプトが壊れる
        #[test]
        fn script_has_no_double_quotes() {
            assert!(!SCRIPT.contains('"'));
        }

        #[test]
        fn script_reads_paths_from_stdin_as_utf8() {
            assert!(SCRIPT.contains("[Console]::In.ReadToEnd()"));
            assert!(SCRIPT.contains("UTF8Encoding"));
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
            assert_eq!(parse_output("警告: 何か\n", 1), Some(vec![None]));
        }
    }
}
