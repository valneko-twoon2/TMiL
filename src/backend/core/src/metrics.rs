use std::time::Duration;

/// 経過時間あたりのバイト数を「毎秒」に換算する。経過時間が 0 なら 0 を返す。
pub fn per_second(bytes: u64, elapsed: Duration) -> u64 {
    let millis = elapsed.as_millis();
    if millis == 0 {
        return 0;
    }
    let value = u128::from(bytes) * 1000 / millis;
    u64::try_from(value).unwrap_or(u64::MAX)
}

/// sysinfo のプロセス CPU 使用率（1 コア = 100）を、全コア合計 = 100 の値に直す。
pub fn normalize_cpu(raw: f32, logical_cores: usize) -> f32 {
    if !raw.is_finite() || raw <= 0.0 {
        return 0.0;
    }
    let cores = f32::from(u16::try_from(logical_cores.max(1)).unwrap_or(u16::MAX));
    (raw / cores).clamp(0.0, 100.0)
}

/// 使用率を 0〜100 に収める。NaN は 0 とみなす。
pub fn clamp_percent(value: f32) -> f32 {
    if value.is_nan() {
        0.0
    } else {
        value.clamp(0.0, 100.0)
    }
}

/// 文字数で切り詰める。切った場合は末尾に「…」を付ける。
pub fn truncate_chars(text: &str, max_chars: usize) -> String {
    let mut chars = text.chars();
    let head: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn per_second_scales_by_elapsed_time() {
            assert_eq!(per_second(2048, Duration::from_millis(2000)), 1024);
            assert_eq!(per_second(500, Duration::from_millis(500)), 1000);
        }

        #[test]
        fn normalize_cpu_divides_by_core_count() {
            assert!((normalize_cpu(200.0, 4) - 50.0).abs() < f32::EPSILON);
        }

        #[test]
        fn clamp_percent_keeps_values_in_range() {
            assert!((clamp_percent(42.5) - 42.5).abs() < f32::EPSILON);
        }

        #[test]
        fn truncate_keeps_short_text() {
            assert_eq!(truncate_chars("abc", 10), "abc");
        }

        #[test]
        fn truncate_counts_multibyte_as_one_char() {
            assert_eq!(truncate_chars("あいうえお", 3), "あいう…");
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn per_second_zero_elapsed_is_zero() {
            assert_eq!(per_second(1000, Duration::ZERO), 0);
        }

        #[test]
        fn per_second_under_one_millisecond_is_zero() {
            assert_eq!(per_second(1000, Duration::from_micros(999)), 0);
        }

        #[test]
        fn per_second_saturates_instead_of_overflowing() {
            assert_eq!(per_second(u64::MAX, Duration::from_millis(1)), u64::MAX);
        }

        #[test]
        fn normalize_cpu_zero_cores_is_treated_as_one() {
            assert!((normalize_cpu(30.0, 0) - 30.0).abs() < f32::EPSILON);
        }

        #[test]
        fn normalize_cpu_clamps_to_hundred() {
            assert!((normalize_cpu(250.0, 2) - 100.0).abs() < f32::EPSILON);
        }

        #[test]
        fn normalize_cpu_negative_and_nan_are_zero() {
            assert!(normalize_cpu(-1.0, 4).abs() < f32::EPSILON);
            assert!(normalize_cpu(f32::NAN, 4).abs() < f32::EPSILON);
            assert!(normalize_cpu(f32::INFINITY, 4).abs() < f32::EPSILON);
        }

        #[test]
        fn normalize_cpu_huge_core_count_saturates() {
            assert!(normalize_cpu(100.0, usize::MAX) > 0.0);
        }

        #[test]
        fn clamp_percent_edges() {
            assert!(clamp_percent(-0.1).abs() < f32::EPSILON);
            assert!((clamp_percent(100.1) - 100.0).abs() < f32::EPSILON);
            assert!(clamp_percent(f32::NAN).abs() < f32::EPSILON);
        }

        #[test]
        fn truncate_exact_length_has_no_ellipsis() {
            assert_eq!(truncate_chars("abc", 3), "abc");
            assert_eq!(truncate_chars("abcd", 3), "abc…");
        }

        #[test]
        fn truncate_zero_and_empty() {
            assert_eq!(truncate_chars("", 0), "");
            assert_eq!(truncate_chars("a", 0), "…");
        }
    }
}
