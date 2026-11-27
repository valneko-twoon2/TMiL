//! freedesktop の `.desktop` ファイル（autostart 用）の読み書き。

const MAIN_GROUP: &str = "[Desktop Entry]";
const HIDDEN: &str = "Hidden";
const GNOME_ENABLED: &str = "X-GNOME-Autostart-enabled";

/// `.desktop` から読み取った autostart に関係する値。
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct DesktopEntry {
    pub name: Option<String>,
    pub exec: Option<String>,
    pub hidden: bool,
    pub gnome_enabled: Option<bool>,
}

impl DesktopEntry {
    /// 自動起動が有効か。
    pub fn is_enabled(&self) -> bool {
        !self.hidden && self.gnome_enabled != Some(false)
    }
}

fn parse_bool(value: &str) -> bool {
    value.trim().eq_ignore_ascii_case("true")
}

/// `[Desktop Entry]` グループのキーを読む。壊れた行は読み飛ばす。
pub fn parse(content: &str) -> DesktopEntry {
    let mut entry = DesktopEntry::default();
    let mut in_main = false;
    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') {
            in_main = line == MAIN_GROUP;
            continue;
        }
        if !in_main {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = value.trim();
        match key.trim() {
            "Name" if entry.name.is_none() => entry.name = Some(value.to_owned()),
            "Exec" if entry.exec.is_none() => entry.exec = Some(value.to_owned()),
            HIDDEN => entry.hidden = parse_bool(value),
            GNOME_ENABLED => entry.gnome_enabled = Some(parse_bool(value)),
            _ => {}
        }
    }
    entry
}

fn is_toggle_key(line: &str) -> bool {
    line.split_once('=')
        .is_some_and(|(key, _)| matches!(key.trim(), HIDDEN | GNOME_ENABLED))
}

/// 有効・無効を書き換えた内容を返す。関係ない行はそのまま残す。
pub fn with_enabled(content: &str, enabled: bool) -> String {
    let toggles = [
        format!("{HIDDEN}={}", !enabled),
        format!("{GNOME_ENABLED}={enabled}"),
    ];
    // 見出しが無いファイルは先頭に見出しを足すので、最初のグループより前の行も
    // 書き換え後は `[Desktop Entry]` に属する。その行の切り替えキーも消す。
    let has_main = content.lines().any(|l| l.trim() == MAIN_GROUP);
    let mut out: Vec<String> = Vec::new();
    let mut in_main = !has_main;
    let mut found_main = false;
    for raw in content.lines() {
        let line = raw.trim();
        if line.starts_with('[') {
            in_main = line == MAIN_GROUP;
            out.push(raw.to_owned());
            if in_main && !found_main {
                found_main = true;
                out.extend(toggles.iter().cloned());
            }
            continue;
        }
        if in_main && is_toggle_key(line) {
            continue;
        }
        out.push(raw.to_owned());
    }
    if !found_main {
        let mut head = vec![MAIN_GROUP.to_owned()];
        head.extend(toggles);
        head.extend(out);
        out = head;
    }
    let mut text = out.join("\n");
    text.push('\n');
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
[Desktop Entry]
Type=Application
Name=Sample App
Exec=/usr/bin/sample --tray
";

    mod equivalence {
        use super::*;

        #[test]
        fn parses_name_and_exec() {
            let e = parse(SAMPLE);
            assert_eq!(e.name.as_deref(), Some("Sample App"));
            assert_eq!(e.exec.as_deref(), Some("/usr/bin/sample --tray"));
            assert!(e.is_enabled());
        }

        #[test]
        fn hidden_true_disables() {
            let e = parse("[Desktop Entry]\nHidden=true\n");
            assert!(!e.is_enabled());
        }

        #[test]
        fn gnome_enabled_false_disables() {
            let e = parse("[Desktop Entry]\nX-GNOME-Autostart-enabled=false\n");
            assert!(!e.is_enabled());
        }

        #[test]
        fn keys_outside_main_group_are_ignored() {
            let e = parse("[Desktop Action new]\nName=Other\nHidden=true\n");
            assert_eq!(e, DesktopEntry::default());
        }

        #[test]
        fn disable_then_enable_restores_enabled_state() {
            let disabled = with_enabled(SAMPLE, false);
            assert!(!parse(&disabled).is_enabled());
            let enabled = with_enabled(&disabled, true);
            assert!(parse(&enabled).is_enabled());
            assert_eq!(parse(&enabled).name.as_deref(), Some("Sample App"));
        }

        #[test]
        fn with_enabled_replaces_existing_keys_instead_of_duplicating() {
            let once = with_enabled(SAMPLE, false);
            let twice = with_enabled(&once, false);
            assert_eq!(once, twice);
            assert_eq!(twice.matches("Hidden=").count(), 1);
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_content() {
            assert_eq!(parse(""), DesktopEntry::default());
            assert!(parse("").is_enabled());
        }

        #[test]
        fn first_name_wins_and_lines_without_equals_are_skipped() {
            let e = parse("[Desktop Entry]\nName=A\nbroken line\nName=B\n");
            assert_eq!(e.name.as_deref(), Some("A"));
        }

        #[test]
        fn bool_parsing_is_case_insensitive_and_trims() {
            assert!(parse("[Desktop Entry]\nHidden = TRUE \n").hidden);
            assert!(!parse("[Desktop Entry]\nHidden=yes\n").hidden);
        }

        #[test]
        fn value_may_contain_equals_sign() {
            let e = parse("[Desktop Entry]\nExec=env A=1 app\n");
            assert_eq!(e.exec.as_deref(), Some("env A=1 app"));
        }

        #[test]
        fn with_enabled_adds_group_when_missing() {
            let text = with_enabled("Name=x\n", false);
            assert!(text.starts_with("[Desktop Entry]\nHidden=true\n"));
            assert!(!parse(&text).is_enabled());
        }

        #[test]
        fn with_enabled_on_empty_content() {
            let text = with_enabled("", true);
            assert_eq!(
                text,
                "[Desktop Entry]\nHidden=false\nX-GNOME-Autostart-enabled=true\n"
            );
        }

        #[test]
        fn comments_and_blank_lines_are_ignored_when_parsing() {
            let e = parse("# c\n\n[Desktop Entry]\n# Name=no\nName=yes\n");
            assert_eq!(e.name.as_deref(), Some("yes"));
        }
    }

    mod regression {
        use super::*;

        /// 見出しの無いファイルにある切り替えキーが残り、有効にしても無効のままだった。
        #[test]
        fn keys_before_any_group_do_not_override_requested_state() {
            let content = "Hidden = false\nX-GNOME-Autostart-enabled=false\n";
            let enabled = with_enabled(content, true);
            assert!(parse(&enabled).is_enabled(), "{enabled}");
            assert_eq!(enabled.matches(GNOME_ENABLED).count(), 1);
        }

        /// 別グループより前の行は、見出しがある場合は対象外のまま残す。
        #[test]
        fn orphan_lines_are_kept_when_main_group_exists() {
            let content = "Hidden=true\n[Desktop Entry]\nName=A\n";
            let text = with_enabled(content, true);
            assert!(text.starts_with("Hidden=true\n[Desktop Entry]\n"));
            assert!(parse(&text).is_enabled());
        }
    }

    /// 乱数で作った内容でも落ちず、書き換え後の状態が指定どおりになることを確かめる（簡易ファジング）。
    mod fuzz {
        use super::*;

        #[test]
        fn rewritten_content_always_has_requested_state() {
            let pieces = [
                "[Desktop Entry]",
                "[Other]",
                "Name=A",
                "Hidden=true",
                "Hidden = false",
                "X-GNOME-Autostart-enabled=false",
                "#c",
                "",
                "=",
                "[Desktop Entry",
                "  Exec=x",
            ];
            let mut state: u64 = 0x9E37_79B9_7F4A_7C15;
            for round in 0..3000 {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                let len = usize::try_from(state % 8).unwrap();
                let content: Vec<&str> = (0..len)
                    .map(|i| {
                        let shift = u32::try_from(i).unwrap() * 7;
                        pieces[usize::try_from((state >> shift) % 11).unwrap()]
                    })
                    .collect();
                let content = content.join("\n");
                let enabled = round % 2 == 0;
                assert_eq!(
                    parse(&with_enabled(&content, enabled)).is_enabled(),
                    enabled,
                    "{content:?}"
                );
            }
        }
    }

    mod snapshot {
        use super::*;

        #[test]
        fn disabled_desktop_file_layout() {
            insta::assert_snapshot!(with_enabled(SAMPLE, false));
        }
    }

    mod first_key {
        use super::*;

        #[test]
        fn first_name_and_exec_win() {
            let e = parse("[Desktop Entry]\nName=A\nExec=first\nName=B\nExec=second\n");
            assert_eq!(e.name.as_deref(), Some("A"));
            assert_eq!(e.exec.as_deref(), Some("first"));
        }
    }

    mod property {
        use super::*;
        use proptest::prelude::*;

        fn line() -> impl Strategy<Value = String> {
            prop_oneof![
                Just("Name=App".to_owned()),
                Just("Exec=app --flag".to_owned()),
                Just("Hidden=true".to_owned()),
                Just("Hidden=false".to_owned()),
                Just("X-GNOME-Autostart-enabled=false".to_owned()),
                Just("X-GNOME-Autostart-enabled=true".to_owned()),
                Just("# コメント".to_owned()),
                Just("[Other Group]".to_owned()),
                Just("[Desktop Entry]".to_owned()),
                "[A-Za-z]{1,8}=[a-z ]{0,8}",
            ]
        }

        proptest! {
            /// どんな中身でも、有効・無効を書き換えた結果を読むと、その通りになっている
            #[test]
            fn with_enabled_is_read_back(lines in proptest::collection::vec(line(), 0..12), enabled in any::<bool>()) {
                let content = format!("[Desktop Entry]\n{}\n", lines.join("\n"));
                prop_assert_eq!(parse(&with_enabled(&content, enabled)).is_enabled(), enabled);
            }

            /// 有効・無効以外の行（名前やコマンド）は書き換えで変わらない
            #[test]
            fn with_enabled_keeps_name_and_exec(lines in proptest::collection::vec(line(), 0..12), enabled in any::<bool>()) {
                let content = format!("[Desktop Entry]\n{}\n", lines.join("\n"));
                let before = parse(&content);
                let after = parse(&with_enabled(&content, enabled));
                prop_assert_eq!(after.name, before.name);
                prop_assert_eq!(after.exec, before.exec);
            }
        }
    }
}
