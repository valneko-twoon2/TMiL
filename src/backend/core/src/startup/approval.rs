//! Windows の `StartupApproved` に保存される有効・無効フラグ。
//! 先頭バイトが偶数（0x02 など）なら有効、奇数（0x03 など）なら無効。値が無ければ有効。

pub fn is_enabled(data: Option<&[u8]>) -> bool {
    data.and_then(<[u8]>::first).is_none_or(|b| b & 1 == 0)
}

pub fn encode(enabled: bool) -> [u8; 12] {
    let flag = if enabled { 0x02 } else { 0x03 };
    [flag, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn even_first_byte_is_enabled() {
            assert!(is_enabled(Some(&[0x02, 0, 0])));
            assert!(is_enabled(Some(&[0x06])));
        }

        #[test]
        fn odd_first_byte_is_disabled() {
            assert!(!is_enabled(Some(&[0x03, 0, 0])));
            assert!(!is_enabled(Some(&[0x07])));
        }

        #[test]
        fn encode_roundtrips() {
            assert!(is_enabled(Some(&encode(true))));
            assert!(!is_enabled(Some(&encode(false))));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn missing_or_empty_value_is_enabled() {
            assert!(is_enabled(None));
            assert!(is_enabled(Some(&[])));
        }

        #[test]
        fn zero_and_max_bytes() {
            assert!(is_enabled(Some(&[0x00])));
            assert!(!is_enabled(Some(&[0xFF])));
        }

        #[test]
        fn encoded_value_is_twelve_bytes() {
            assert_eq!(encode(true).len(), 12);
        }
    }
}
