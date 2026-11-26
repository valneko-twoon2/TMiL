//! スタートアップ アプリの一覧と有効・無効の切り替え。
//! Windows はレジストリとスタートアップフォルダー、Linux は XDG autostart を見る。

pub mod approval;
pub mod command;
pub mod desktop;
pub mod registry;
#[cfg(windows)]
pub mod win_registry;
pub mod xdg;

use std::fmt;

use crate::model::{StartupEntry, StartupLocation};

/// スタートアップ操作のエラー。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartupError {
    /// ID の形式が正しくない
    InvalidId,
    /// 項目が見つからない
    NotFound,
    /// この画面からは切り替えられない（管理者権限が必要など）
    NotToggleable,
    /// 読み書きに失敗した
    Io(String),
}

impl fmt::Display for StartupError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidId => f.write_str("項目の指定が正しくありません。"),
            Self::NotFound => f.write_str("項目が見つかりません。一覧を更新してください。"),
            Self::NotToggleable => {
                f.write_str("この項目は切り替えられません（管理者権限が必要です）。")
            }
            Self::Io(e) => write!(f, "書き込みに失敗しました: {e}"),
        }
    }
}

impl std::error::Error for StartupError {}

/// `場所:名前` 形式の ID を分解する。
pub fn parse_id(id: &str) -> Result<(StartupLocation, &str), StartupError> {
    let (key, name) = id.split_once(':').ok_or(StartupError::InvalidId)?;
    let location = StartupLocation::from_key(key).ok_or(StartupError::InvalidId)?;
    if name.is_empty() {
        return Err(StartupError::InvalidId);
    }
    Ok((location, name))
}

#[cfg(windows)]
fn windows_folders() -> registry::StartupFolders {
    let appdata = std::env::var("APPDATA").ok();
    let program_data = std::env::var("ProgramData").ok();
    registry::StartupFolders::from_env(appdata.as_deref(), program_data.as_deref())
}

#[cfg(not(windows))]
fn xdg_dirs() -> (std::path::PathBuf, Vec<std::path::PathBuf>) {
    let var = |k: &str| std::env::var(k).ok();
    let (config_home, home, config_dirs) =
        (var("XDG_CONFIG_HOME"), var("HOME"), var("XDG_CONFIG_DIRS"));
    xdg::default_dirs(
        config_home.as_deref(),
        home.as_deref(),
        config_dirs.as_deref(),
    )
}

/// この OS のスタートアップ項目を一覧にする。
pub fn list() -> Vec<StartupEntry> {
    #[cfg(windows)]
    {
        registry::list(&win_registry::WinRegistry, &windows_folders())
    }
    #[cfg(not(windows))]
    {
        let (user, system) = xdg_dirs();
        xdg::list_in(&user, &system)
    }
}

/// ID で指定した項目の有効・無効を切り替える。
pub fn set_enabled(id: &str, enabled: bool) -> Result<(), StartupError> {
    let (location, name) = parse_id(id)?;
    #[cfg(windows)]
    {
        registry::set_enabled(
            &win_registry::WinRegistry,
            &windows_folders(),
            location,
            name,
            enabled,
        )
    }
    #[cfg(not(windows))]
    {
        match location {
            StartupLocation::AutostartUser | StartupLocation::AutostartSystem => {
                let (user, system) = xdg_dirs();
                xdg::set_enabled_in(&user, &system, name, enabled)
            }
            _ => Err(StartupError::NotToggleable),
        }
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    /// テスト用の一時ディレクトリ。破棄時に消す。
    pub(crate) struct TempDir(PathBuf);

    impl TempDir {
        pub(crate) fn new(label: &str) -> Self {
            let n = COUNTER.fetch_add(1, Ordering::Relaxed);
            let dir =
                std::env::temp_dir().join(format!("tmil-test-{label}-{}-{n}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        pub(crate) fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn parse_id_splits_location_and_name() {
            assert_eq!(
                parse_id("registryUser:Chat").unwrap(),
                (StartupLocation::RegistryUser, "Chat")
            );
        }

        #[test]
        fn parse_id_keeps_colons_in_name() {
            assert_eq!(
                parse_id("folderUser:a:b.lnk").unwrap(),
                (StartupLocation::FolderUser, "a:b.lnk")
            );
        }

        #[test]
        fn error_messages_are_japanese() {
            assert!(
                StartupError::NotFound
                    .to_string()
                    .contains("見つかりません")
            );
            assert!(StartupError::Io("x".to_owned()).to_string().contains('x'));
            assert!(StartupError::InvalidId.to_string().contains("正しく"));
            assert!(StartupError::NotToggleable.to_string().contains("管理者"));
        }

        #[test]
        fn listing_on_this_os_does_not_fail() {
            let entries = list();
            assert!(entries.iter().all(|e| e.id.starts_with(e.location.key())));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn parse_id_rejects_malformed_ids() {
            for id in ["", "registryUser", "registryUser:", "unknown:x", ":x"] {
                assert_eq!(parse_id(id), Err(StartupError::InvalidId), "{id}");
            }
        }

        #[test]
        fn set_enabled_rejects_malformed_id() {
            assert_eq!(set_enabled("bad", true), Err(StartupError::InvalidId));
        }
    }
}
