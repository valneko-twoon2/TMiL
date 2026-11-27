//! Linux の `/proc` から、sysinfo では取れない値を読む（読み方は純粋関数にしてどの OS でもテストする）。

/// `/proc/<pid>/stat` の `n` 番目（1 から数える。3 番目以降だけ）の項目。
/// 2 番目の名前には空白や括弧が入りうるので、最後の `)` の後ろから数える。
pub fn stat_field(stat: &str, n: usize) -> Option<&str> {
    let (_, rest) = stat.rsplit_once(')')?;
    rest.split_whitespace().nth(n.checked_sub(3)?)
}

/// `/proc/<pid>/stat` からスレッドの数（20 番目の項目）を読む。
pub fn thread_count_from_stat(stat: &str) -> Option<u32> {
    stat_field(stat, 20)?.parse().ok()
}

/// プロセスのスレッドの数（Linux のみ。ほかの OS と読めないときは `None`）。
pub fn thread_count(pid: u32) -> Option<u32> {
    if cfg!(target_os = "linux") {
        let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
        thread_count_from_stat(&stat)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STAT: &str =
        "1234 (my (odd) app) S 1 1234 1234 0 -1 4194560 100 0 0 0 5 3 0 0 20 0 7 0 12345 1000 200";

    mod equivalence {
        use super::*;

        #[test]
        fn thread_count_is_the_twentieth_field() {
            assert_eq!(thread_count_from_stat(STAT), Some(7));
        }

        #[test]
        fn fields_after_name_are_counted_from_three() {
            assert_eq!(stat_field(STAT, 3), Some("S"));
            assert_eq!(stat_field(STAT, 19), Some("0"));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn fields_before_three_are_not_read() {
            assert_eq!(stat_field(STAT, 2), None);
            assert_eq!(stat_field(STAT, 0), None);
        }

        #[test]
        fn short_or_broken_stat_has_no_thread_count() {
            assert_eq!(thread_count_from_stat("1 (a) S 1"), None);
            assert_eq!(thread_count_from_stat("no parenthesis"), None);
            assert_eq!(thread_count_from_stat(""), None);
        }

        #[test]
        fn non_numeric_thread_count_is_none() {
            let stat = STAT.replace(" 7 0 12345", " x 0 12345");
            assert_eq!(thread_count_from_stat(&stat), None);
        }
    }

    mod system {
        use super::*;

        #[test]
        fn own_process_has_threads_only_on_linux() {
            let threads = thread_count(std::process::id());
            if cfg!(target_os = "linux") {
                assert!(threads.is_some_and(|n| n >= 1));
            } else {
                assert_eq!(threads, None);
            }
        }
    }
}
