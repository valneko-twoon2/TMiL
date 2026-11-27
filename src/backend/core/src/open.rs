//! ほかのアプリで開く操作。
//! - 「ファイルの場所を開く」: 実行ファイルを選んだ状態でファイル マネージャーを開く
//! - 「オンライン検索」: プロセスの名前をブラウザーで検索する
//!
//! 状態を持たない操作なので状態機械は通さない。画面から渡された値はそのまま使わない。
//! 場所は実在するファイルの絶対パスであることを確かめ（ファイル自体は実行しない）、
//! 検索は決まった検索サイトの URL を組み立て、言葉は URL エンコードしてから渡す。

use std::fmt::Write as _;
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
    open_location(path)
}

/// 検索に使うサイト（本家のタスク マネージャーと同じ Bing）。
pub const SEARCH_URL: &str = "https://www.bing.com/search?q=";
/// 検索する言葉の長さの上限。
const MAX_QUERY_CHARS: usize = 200;

/// URL のクエリに入れられるようにする（英数字と `-_.~` 以外はすべて %XX にする）。
pub fn url_encode(text: &str) -> String {
    let mut out = String::with_capacity(text.len() * 3);
    for b in text.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(char::from(b));
        } else {
            let _ = write!(out, "%{b:02X}");
        }
    }
    out
}

/// 検索する URL を作る。空や長すぎる言葉は受け付けない。
pub fn search_url(query: &str) -> Result<String, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("検索する言葉がありません。".to_owned());
    }
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err("検索する言葉が長すぎます。".to_owned());
    }
    Ok(format!("{SEARCH_URL}{}", url_encode(query)))
}

/// プロセスの名前などをブラウザーで検索する。
pub fn search_online(query: &str) -> Result<(), String> {
    open_url(&search_url(query)?)
}

#[cfg(windows)]
fn open_url(url: &str) -> Result<(), String> {
    // URL は search_url が組み立てたもので、空白や引用符を含まない
    std::process::Command::new("explorer.exe")
        .arg(url)
        .status()
        .map(|_| ())
        .map_err(|e| format!("ブラウザーを開けません: {e}"))
}

#[cfg(not(windows))]
fn open_url(url: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .status()
        .map(|_| ())
        .map_err(|e| format!("ブラウザーを開けません（xdg-open が必要です）: {e}"))
}

#[cfg(windows)]
fn open_location(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // explorer は引用符の付け方が独特なので、引数をそのまま渡す（validate で引用符は除いてある）
    std::process::Command::new("explorer.exe")
        .raw_arg(explorer_select_arg(path))
        .status()
        .map(|_| ())
        .map_err(|e| format!("エクスプローラーを開けません: {e}"))
}

#[cfg(not(windows))]
fn open_location(path: &str) -> Result<(), String> {
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

/// サービス管理ツール（services.msc）を開く（Windows のみ）。
#[cfg(windows)]
pub fn open_services_tool() -> Result<(), String> {
    std::process::Command::new("mmc.exe")
        .arg("services.msc")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("サービス管理ツールを開けません: {e}"))
}

/// サービス管理ツールを開く（Windows のみ）。
#[cfg(not(windows))]
pub fn open_services_tool() -> Result<(), String> {
    Err("サービス管理ツールは Windows でだけ開けます。".to_owned())
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
        fn search_url_encodes_the_query() {
            assert_eq!(
                search_url("chrome.exe").unwrap(),
                "https://www.bing.com/search?q=chrome.exe"
            );
            assert_eq!(
                search_url("a b&c=\"d\"").unwrap(),
                "https://www.bing.com/search?q=a%20b%26c%3D%22d%22"
            );
        }

        #[test]
        fn non_ascii_is_percent_encoded_as_utf8() {
            assert_eq!(url_encode("あ"), "%E3%81%82");
        }

        #[test]
        fn relative_paths_are_rejected() {
            assert!(validate(r"app.exe").is_err());
            assert!(validate(r"%windir%\system32\a.exe").is_err());
        }

        #[test]
        fn missing_file_is_an_error() {
            let err = reveal("/taskmanagerlite/no/such/file").unwrap_err();
            assert!(
                err.contains("見つかりません") || err.contains("絶対パス"),
                "{err}"
            );
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_query_is_rejected_before_opening_browser() {
            assert!(search_online("").is_err());
            assert!(search_online("   ").is_err());
        }

        #[test]
        fn empty_or_too_long_query_is_rejected() {
            assert!(search_url("").is_err());
            assert!(search_url("   ").is_err());
            assert!(search_url(&"a".repeat(MAX_QUERY_CHARS)).is_ok());
            assert!(search_url(&"a".repeat(MAX_QUERY_CHARS + 1)).is_err());
        }

        #[test]
        fn query_is_trimmed() {
            assert_eq!(search_url("  x  ").unwrap(), format!("{SEARCH_URL}x"));
        }

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

    mod property {
        use super::*;
        use proptest::prelude::*;

        fn decode(text: &str) -> Vec<u8> {
            let bytes = text.as_bytes();
            let mut out = Vec::new();
            let mut i = 0;
            while let Some(&b) = bytes.get(i) {
                if b == b'%' {
                    let hex = std::str::from_utf8(bytes.get(i + 1..i + 3).unwrap()).unwrap();
                    out.push(u8::from_str_radix(hex, 16).unwrap());
                    i += 3;
                } else {
                    out.push(b);
                    i += 1;
                }
            }
            out
        }

        proptest! {
            /// エンコードした結果には、そのまま URL に入れてよい文字と %XX だけが並び、戻すと元の言葉になる
            #[test]
            fn url_encode_is_safe_and_reversible(text in any::<String>()) {
                let encoded = url_encode(&text);
                prop_assert!(encoded.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_.~%".contains(&b)));
                prop_assert_eq!(decode(&encoded), text.as_bytes());
            }

            /// 検索の URL は、どんな言葉でも決まったサイトの URL から始まり、空白や引用符を含まない
            #[test]
            fn search_url_never_escapes_the_site(text in any::<String>()) {
                if let Ok(url) = search_url(&text) {
                    prop_assert!(url.starts_with(SEARCH_URL));
                    prop_assert!(!url.contains([' ', '"', '\'', '\n']));
                }
            }

            /// 受け付けた場所には、コマンドの引数を壊す文字が入っていない
            #[test]
            fn accepted_paths_have_no_breaking_characters(path in any::<String>()) {
                if validate(&path).is_ok() {
                    prop_assert!(!path.contains('"'));
                    prop_assert!(!path.chars().any(char::is_control));
                    prop_assert!(!path.trim().is_empty());
                }
            }
        }
    }
}
