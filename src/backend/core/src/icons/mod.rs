pub mod freedesktop;
pub mod script;
#[cfg(windows)]
mod windows;

use std::collections::HashMap;
use std::sync::Mutex;

use crate::model::ProcessIcon;

pub const MAX_PER_REQUEST: usize = 256;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExeDetails {
    /// 画像の data URL
    pub icon: Option<String>,
    pub description: Option<String>,
    pub company: Option<String>,
}

#[derive(Debug, Default)]
pub struct IconCache {
    known: Mutex<HashMap<String, ExeDetails>>,
}

fn is_lookup_target(exe: &str) -> bool {
    !exe.trim().is_empty() && !exe.contains(['\n', '\r', '\0'])
}

impl IconCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// アイコンを返す。まだ調べていないものだけを `load` に渡し、結果を覚える。
    /// `load` は渡した順に同じ数の結果を返す。重いので、覚え書きのロックを持たずに呼ぶ。
    pub fn icons(
        &self,
        exes: &[String],
        load: impl FnOnce(&[String]) -> Vec<ExeDetails>,
    ) -> Vec<ProcessIcon> {
        let mut requested: Vec<String> = Vec::new();
        for exe in exes {
            if !requested.contains(exe) && requested.len() < MAX_PER_REQUEST {
                requested.push(exe.clone());
            }
        }

        let missing: Vec<String> = {
            let known = self.lock_ignoring_poison();
            requested
                .iter()
                .filter(|e| is_lookup_target(e) && !known.contains_key(*e))
                .cloned()
                .collect()
        };
        if !missing.is_empty() {
            let mut loaded = load(&missing);
            if loaded.len() != missing.len() {
                loaded = vec![ExeDetails::default(); missing.len()];
            }
            let mut known = self.lock_ignoring_poison();
            known.extend(missing.into_iter().zip(loaded));
        }

        let known = self.lock_ignoring_poison();
        requested
            .into_iter()
            .map(|exe| {
                let details = known.get(&exe).cloned().unwrap_or_default();
                ProcessIcon {
                    exe,
                    icon: details.icon,
                    description: details.description,
                    company: details.company,
                }
            })
            .collect()
    }

    fn lock_ignoring_poison(&self) -> std::sync::MutexGuard<'_, HashMap<String, ExeDetails>> {
        self.known
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

/// この OS の方法でアイコンと説明を取り出す（渡した順に同じ数を返す）。
#[cfg(windows)]
pub fn load(exes: &[String]) -> Vec<ExeDetails> {
    windows::load(exes)
}

/// この OS の方法でアイコンと説明を取り出す（渡した順に同じ数を返す）。
#[cfg(not(windows))]
pub fn load(exes: &[String]) -> Vec<ExeDetails> {
    freedesktop::load(exes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn strings(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| (*s).to_owned()).collect()
    }

    fn fake(prefix: &str) -> impl Fn(&[String]) -> Vec<ExeDetails> + '_ {
        move |exes| {
            exes.iter()
                .map(|e| ExeDetails {
                    icon: Some(format!("{prefix}{e}")),
                    description: Some(format!("説明 {e}")),
                    company: None,
                })
                .collect()
        }
    }

    mod equivalence {
        use super::*;

        #[test]
        fn returns_icons_in_requested_order() {
            let cache = IconCache::new();
            let icons = cache.icons(&strings(&["b", "a"]), fake("x:"));
            assert_eq!(
                icons,
                vec![
                    ProcessIcon {
                        exe: "b".to_owned(),
                        icon: Some("x:b".to_owned()),
                        description: Some("説明 b".to_owned()),
                        company: None,
                    },
                    ProcessIcon {
                        exe: "a".to_owned(),
                        icon: Some("x:a".to_owned()),
                        description: Some("説明 a".to_owned()),
                        company: None,
                    },
                ]
            );
        }

        #[test]
        fn loads_only_unknown_exes() {
            let cache = IconCache::new();
            cache.icons(&strings(&["a"]), fake("1:"));
            let asked = RefCell::new(Vec::new());
            let icons = cache.icons(&strings(&["a", "b"]), |exes| {
                asked.borrow_mut().extend_from_slice(exes);
                fake("2:")(exes)
            });
            assert_eq!(*asked.borrow(), strings(&["b"]));
            assert_eq!(
                icons.first().and_then(|i| i.icon.clone()),
                Some("1:a".to_owned())
            );
        }

        #[test]
        fn remembers_missing_icons_too() {
            let cache = IconCache::new();
            cache.icons(&strings(&["a"]), |exes| {
                vec![ExeDetails::default(); exes.len()]
            });
            let mut called = false;
            let icons = cache.icons(&strings(&["a"]), |_| {
                called = true;
                Vec::new()
            });
            assert!(!called);
            assert_eq!(icons.first().and_then(|i| i.icon.clone()), None);
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_request_does_not_load() {
            let cache = IconCache::new();
            let icons = cache.icons(&[], |_| panic!("呼ばれないはず"));
            assert_eq!(icons, Vec::new());
        }

        #[test]
        fn blank_or_multiline_paths_are_not_loaded() {
            let cache = IconCache::new();
            let icons = cache.icons(&strings(&["", "a\nb", "  "]), |_| panic!("呼ばれないはず"));
            assert_eq!(icons.len(), 3);
            assert!(icons.iter().all(|i| i.icon.is_none()));
        }

        #[test]
        fn duplicates_are_merged() {
            let cache = IconCache::new();
            let icons = cache.icons(&strings(&["a", "a"]), fake("x:"));
            assert_eq!(icons.len(), 1);
        }

        #[test]
        fn request_is_capped() {
            let cache = IconCache::new();
            let many: Vec<String> = (0..MAX_PER_REQUEST + 10).map(|i| i.to_string()).collect();
            let icons = cache.icons(&many, fake("x:"));
            assert_eq!(icons.len(), MAX_PER_REQUEST);
        }

        #[test]
        fn wrong_number_of_results_means_no_icons() {
            let cache = IconCache::new();
            let icons = cache.icons(&strings(&["a", "b"]), |_| {
                vec![ExeDetails {
                    icon: Some("x".to_owned()),
                    ..ExeDetails::default()
                }]
            });
            assert!(
                icons
                    .iter()
                    .all(|i| i.icon.is_none() && i.description.is_none())
            );
        }
    }

    /// 実際に PowerShell でアイコンを取り出す（Windows のみ）。
    #[cfg(windows)]
    mod windows_load {
        use super::*;

        #[test]
        fn real_executable_has_png_icon_and_description_and_missing_file_has_none() {
            let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".to_owned());
            let exes = vec![
                format!(r"{windir}\explorer.exe"),
                format!(r"{windir}\taskmanagerlite-no-such-file.exe"),
            ];
            let details = load(&exes);
            assert_eq!(details.len(), 2);
            let explorer = details.first().unwrap();
            assert!(
                explorer
                    .icon
                    .as_deref()
                    .is_some_and(|i| i.starts_with("data:image/png;base64,iVBOR")),
                "{details:?}"
            );
            assert!(explorer.description.is_some(), "{details:?}");
            assert!(
                explorer
                    .company
                    .as_deref()
                    .is_some_and(|c| c.contains("Microsoft")),
                "{details:?}"
            );
            assert_eq!(details.get(1), Some(&ExeDetails::default()));
        }
    }

    mod property {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// 問い合わせた順に重なりを除いて返し、上限を超えない。2 回目は何も取りに行かない
            #[test]
            fn icons_follow_request_order_and_are_remembered(
                exes in proptest::collection::vec("[a-c]{0,2}", 0..400),
            ) {
                let cache = IconCache::new();
                let icons = cache.icons(&exes, fake("x:"));
                let mut expected: Vec<String> = Vec::new();
                for e in &exes {
                    if !expected.contains(e) && expected.len() < MAX_PER_REQUEST {
                        expected.push(e.clone());
                    }
                }
                prop_assert_eq!(icons.iter().map(|i| i.exe.clone()).collect::<Vec<_>>(), expected);
                let again = cache.icons(&exes, |asked| {
                    assert!(asked.is_empty(), "覚えているものを聞き直した: {asked:?}");
                    Vec::new()
                });
                prop_assert_eq!(again, icons);
            }
        }
    }
}
