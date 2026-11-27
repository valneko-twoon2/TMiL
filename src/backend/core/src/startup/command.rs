//! コマンドライン文字列から実行ファイル部分を取り出す。

/// コマンドラインの先頭にある実行ファイルを返す。
///
/// - `"C:\Program Files\App\app.exe" --min` → `C:\Program Files\App\app.exe`
/// - `C:\Program Files\App\app.exe --min`（引用符なし）→ `.exe` までを 1 つとみなす
/// - `/usr/bin/app %U` → `/usr/bin/app`
pub fn program_of(command: &str) -> &str {
    let text = command.trim_start();
    if let Some(rest) = text.strip_prefix('"') {
        return rest.split_once('"').map_or(rest, |(program, _)| program);
    }
    if let Some(program) = up_to_exe(text) {
        return program;
    }
    text.split_whitespace().next().unwrap_or("")
}

/// 引用符なしで空白を含む Windows パス向け。`.exe` の直後が空白か末尾なら、そこまでを返す。
fn up_to_exe(text: &str) -> Option<&str> {
    let lower = text.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower.get(from..).and_then(|s| s.find(".exe")) {
        let end = from + found + ".exe".len();
        let next = text.get(end..).and_then(|s| s.chars().next());
        if next.is_none_or(char::is_whitespace) {
            return text.get(..end);
        }
        from = end;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn quoted_path_with_arguments() {
            assert_eq!(
                program_of(r#""C:\Program Files\App\app.exe" --min"#),
                r"C:\Program Files\App\app.exe"
            );
        }

        #[test]
        fn unquoted_path_with_spaces_ends_at_exe() {
            assert_eq!(
                program_of(r"C:\Program Files\App\app.exe /background"),
                r"C:\Program Files\App\app.exe"
            );
        }

        #[test]
        fn unix_command_with_field_code() {
            assert_eq!(program_of("/usr/bin/app %U"), "/usr/bin/app");
        }

        #[test]
        fn exe_in_the_middle_of_a_word_is_ignored() {
            assert_eq!(program_of("tool.exes --x"), "tool.exes");
            assert_eq!(program_of(r"C:\a.exe.bak\b.EXE -y"), r"C:\a.exe.bak\b.EXE");
        }
    }

    mod twice {
        use super::*;

        #[test]
        fn exe_inside_a_folder_name_is_skipped() {
            assert_eq!(
                program_of(r"C:\Tools\old.exe.d\new app.exe --run"),
                r"C:\Tools\old.exe.d\new app.exe"
            );
            assert_eq!(program_of(r"C:\a.exe.b.exe x"), r"C:\a.exe.b.exe");
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_and_blank_commands() {
            assert_eq!(program_of(""), "");
            assert_eq!(program_of("   "), "");
        }

        #[test]
        fn unclosed_quote_takes_the_rest() {
            assert_eq!(program_of(r#""C:\app.exe --x"#), r"C:\app.exe --x");
        }

        #[test]
        fn only_quotes() {
            assert_eq!(program_of(r#""""#), "");
        }

        #[test]
        fn exe_at_end_of_text() {
            assert_eq!(program_of("app.exe"), "app.exe");
        }

        #[test]
        fn leading_whitespace_is_skipped() {
            assert_eq!(program_of("  app --x"), "app");
        }
    }

    /// 乱数入力で落ちないこと、結果が元の文字列に含まれることを確かめる（簡易ファジング）。
    mod fuzz {
        use super::*;

        fn xorshift(state: &mut u64) -> u64 {
            *state ^= *state << 13;
            *state ^= *state >> 7;
            *state ^= *state << 17;
            *state
        }

        #[test]
        fn random_inputs_never_panic() {
            let alphabet: Vec<char> = "ab \"\\.exEXE\t/%é漢\u{3000}".chars().collect();
            let mut state = 0x9E37_79B9_7F4A_7C15;
            for _ in 0..5000 {
                let len = usize::try_from(xorshift(&mut state) % 24).unwrap();
                let text: String = (0..len)
                    .map(|_| {
                        let i = usize::try_from(xorshift(&mut state)).unwrap() % alphabet.len();
                        alphabet[i]
                    })
                    .collect();
                let program = program_of(&text);
                assert!(text.contains(program), "{text:?} -> {program:?}");
            }
        }
    }
}
