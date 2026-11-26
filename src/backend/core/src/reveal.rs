//! 「ファイルの場所を開く」。実行ファイルを選んだ状態でファイル マネージャーを開く。
//!
//! 状態を持たない操作なので状態機械は通さない。画面から渡された場所は、
//! 実在するファイルの絶対パスであることを確かめてから使う（ファイル自体は実行しない）。

use std::path::Path;

/// 開く前に場所を確かめる（純粋関数。実在の確認は呼び出し側）。
pub fn validate(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("ファイルの場所が分かりません。".to_owned());
    }
    // 引用符や制御文字は、コマンドの引数を壊しうるので受け付けない（Windows のパスには使えない文字）
    if path.chars().any(|c| c == '"' || c.is_control()) {
        return Err("ファイルの場所に使えない文字が含まれています。".to_owned());
    }
    if !is_absolute(path) {
        return Err(format!("ファイルの場所が絶対パスではありません: {path}"));
    }
    Ok(())
}

/// Windows のドライブ付き（`C:\`）か UNC（`\\server\`）、または `/` から始まるパスか。
fn is_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    let drive = matches!(bytes, [letter, b':', b'\\' | b'/', ..] if letter.is_ascii_alphabetic());
    drive || path.starts_with(r"\\") || path.starts_with('/')
}

/// Windows のエクスプローラーに渡す引数（`/select,"<path>"`）。
pub fn explorer_select_arg(path: &str) -> String {
    format!("/select,\"{path}\"")
}

/// ファイルの場所を開く。
pub fn reveal(path: &str) -> Result<(), String> {
    validate(path)?;
    if !Path::new(path).is_file() {
        return Err(format!("ファイルが見つかりません: {path}"));
    }
    open(path)
}

#[cfg(windows)]
fn open(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // explorer は引用符の付け方が独特なので、引数をそのまま渡す（validate で引用符は除いてある）
    std::process::Command::new("explorer.exe")
        .raw_arg(explorer_select_arg(path))
        .status()
        .map(|_| ())
        .map_err(|e| format!("エクスプローラーを開けません: {e}"))
}

#[cfg(not(windows))]
fn open(path: &str) -> Result<(), String> {
    // ファイルを開くと実行されうるので、入っているフォルダーを開く
    let dir = Path::new(path)
        .parent()
        .ok_or_else(|| "フォルダーが分かりません。".to_owned())?;
    std::process::Command::new("xdg-open")
        .arg(dir)
        .status()
        .map(|_| ())
        .map_err(|e| format!("フォルダーを開けません（xdg-open が必要です）: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn absolute_paths_are_accepted() {
            assert_eq!(validate(r"C:\Program Files\App\app.exe"), Ok(()));
            assert_eq!(validate(r"\\server\share\app.exe"), Ok(()));
            assert_eq!(validate("/usr/bin/htop"), Ok(()));
        }

        #[test]
        fn explorer_argument_quotes_the_path() {
            assert_eq!(
                explorer_select_arg(r"C:\Program Files\a.exe"),
                r#"/select,"C:\Program Files\a.exe""#
            );
        }

        #[test]
        fn relative_paths_are_rejected() {
            assert!(validate(r"app.exe").is_err());
            assert!(validate(r"%windir%\system32\a.exe").is_err());
        }

        #[test]
        fn missing_file_is_an_error() {
            let err = reveal("/tmil/no/such/file").unwrap_err();
            assert!(
                err.contains("見つかりません") || err.contains("絶対パス"),
                "{err}"
            );
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_path_is_rejected() {
            assert!(validate("").is_err());
            assert!(validate("   ").is_err());
        }

        #[test]
        fn quotes_and_control_characters_are_rejected() {
            assert!(validate(r#"C:\a" /x"#).is_err());
            assert!(validate("/usr/bin/a\nb").is_err());
        }

        #[test]
        fn drive_without_separator_is_not_absolute() {
            assert!(validate("C:app.exe").is_err());
            assert!(validate("1:\\a").is_err());
        }
    }
}
