//! 画像を data URL にするための Base64（RFC 4648、パディングあり）。依存を増やさないよう自前で持つ。

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn symbol(index: u32) -> char {
    // index は 6 ビット（0〜63）に切り詰めてから引くので、範囲外にならない
    ALPHABET
        .get((index & 0x3f) as usize)
        .map_or('=', |&b| char::from(b))
}

/// バイト列を Base64 の文字列にする。
pub fn encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = u32::from(chunk.first().copied().unwrap_or(0));
        let b1 = u32::from(chunk.get(1).copied().unwrap_or(0));
        let b2 = u32::from(chunk.get(2).copied().unwrap_or(0));
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(symbol(n >> 18));
        out.push(symbol(n >> 12));
        out.push(if chunk.len() > 1 { symbol(n >> 6) } else { '=' });
        out.push(if chunk.len() > 2 { symbol(n) } else { '=' });
    }
    out
}

/// Base64 として正しい文字列か（PowerShell の出力を確かめる用）。
pub fn is_valid(text: &str) -> bool {
    !text.is_empty()
        && text.len().is_multiple_of(4)
        && text
            .trim_end_matches('=')
            .bytes()
            .all(|b| ALPHABET.contains(&b))
        && text.len() - text.trim_end_matches('=').len() <= 2
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn rfc4648_test_vectors() {
            for (input, expected) in [
                ("f", "Zg=="),
                ("fo", "Zm8="),
                ("foo", "Zm9v"),
                ("foob", "Zm9vYg=="),
                ("fooba", "Zm9vYmE="),
                ("foobar", "Zm9vYmFy"),
            ] {
                assert_eq!(encode(input.as_bytes()), expected, "{input}");
            }
        }

        #[test]
        fn uses_plus_and_slash_for_high_values() {
            assert_eq!(encode(&[0xfb, 0xff]), "+/8=");
        }

        #[test]
        fn valid_and_invalid_text() {
            assert!(is_valid("Zm9vYg=="));
            assert!(!is_valid("Zm9v Yg=="));
            assert!(!is_valid("<svg>"));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_input_is_empty_output() {
            assert_eq!(encode(&[]), "");
            assert!(!is_valid(""));
        }

        #[test]
        fn length_not_multiple_of_four_is_invalid() {
            assert!(!is_valid("Zm9"));
        }

        #[test]
        fn too_much_padding_is_invalid() {
            assert!(!is_valid("Zm==="));
            assert!(!is_valid("Z==="));
        }
    }
}
