//! プロセスのアイコン。実行ファイルの場所から、画面に出す画像（data URL）を作る。
//!
//! 状態を持たない読み取りなので状態機械は通さない（スタートアップ一覧と同じ扱い）。
//! 取り出しは重いので、一度調べた結果は [`IconCache`] が覚えておく。
//! - Windows: PowerShell（System.Drawing）で実行ファイルからまとめて取り出す
//! - Linux: `.desktop` ファイルの `Icon` からアイコンテーマの画像を探す

pub mod base64;
pub mod freedesktop;
pub mod script;
#[cfg(windows)]
mod windows;

use std::collections::HashMap;
use std::sync::Mutex;

use crate::model::ProcessIcon;

/// 1 回の問い合わせで調べる数の上限（画面に出る分には足りる）。
pub const MAX_PER_REQUEST: usize = 256;

/// 調べた結果の覚え書き。実行ファイルの場所 → data URL（見つからなければ `None`）。
#[derive(Debug, Default)]
pub struct IconCache {
    known: Mutex<HashMap<String, Option<String>>>,
}

/// 問い合わせとして受け付ける実行ファイルの場所か。
/// 空や改行を含むもの（PowerShell に 1 行ずつ渡すため）は調べずに `None` とする。
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
        load: impl FnOnce(&[String]) -> Vec<Option<String>>,
    ) -> Vec<ProcessIcon> {
        let mut requested: Vec<String> = Vec::new();
        for exe in exes {
            if !requested.contains(exe) && requested.len() < MAX_PER_REQUEST {
                requested.push(exe.clone());
            }
        }

        let missing: Vec<String> = {
            let known = self.lock();
            requested
                .iter()
                .filter(|e| is_lookup_target(e) && !known.contains_key(*e))
                .cloned()
                .collect()
        };
        if !missing.is_empty() {
            let mut loaded = load(&missing);
            // 数が合わないときは、どれがどれか分からないので全部「無し」として扱う
            if loaded.len() != missing.len() {
                loaded = vec![None; missing.len()];
            }
            let mut known = self.lock();
            known.extend(missing.into_iter().zip(loaded));
        }

        let known = self.lock();
        requested
            .into_iter()
            .map(|exe| {
                let icon = known.get(&exe).cloned().flatten();
                ProcessIcon { exe, icon }
            })
            .collect()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Option<String>>> {
        // 覚え書きが壊れても読み直せば済むので、毒されたロックもそのまま使う
        self.known
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

/// この OS の方法でアイコンを取り出す（渡した順に同じ数を返す）。
#[cfg(windows)]
pub fn load(exes: &[String]) -> Vec<Option<String>> {
    windows::load(exes)
}

/// この OS の方法でアイコンを取り出す（渡した順に同じ数を返す）。
#[cfg(not(windows))]
pub fn load(exes: &[String]) -> Vec<Option<String>> {
    freedesktop::load(exes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn strings(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| (*s).to_owned()).collect()
    }

    fn fake(prefix: &str) -> impl Fn(&[String]) -> Vec<Option<String>> + '_ {
        move |exes| exes.iter().map(|e| Some(format!("{prefix}{e}"))).collect()
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
                        icon: Some("x:b".to_owned())
                    },
                    ProcessIcon {
                        exe: "a".to_owned(),
                        icon: Some("x:a".to_owned())
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
            cache.icons(&strings(&["a"]), |exes| vec![None; exes.len()]);
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
            let icons = cache.icons(&strings(&["a", "b"]), |_| vec![Some("x".to_owned())]);
            assert!(icons.iter().all(|i| i.icon.is_none()));
        }
    }

    /// 実際に PowerShell でアイコンを取り出す（Windows のみ）。
    #[cfg(windows)]
    mod windows_load {
        use super::*;

        #[test]
        fn real_executable_has_png_icon_and_missing_file_has_none() {
            let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".to_owned());
            let exes = vec![
                format!(r"{windir}\explorer.exe"),
                format!(r"{windir}\tmil-no-such-file.exe"),
            ];
            let icons = load(&exes);
            assert_eq!(icons.len(), 2);
            assert!(
                icons
                    .first()
                    .and_then(Option::as_deref)
                    .is_some_and(|i| i.starts_with("data:image/png;base64,iVBOR")),
                "{icons:?}"
            );
            assert_eq!(icons.get(1), Some(&None));
        }
    }
}
