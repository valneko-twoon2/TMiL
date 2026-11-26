//! Windows のスタートアップ（Run キーとスタートアップフォルダー）を扱う。
//! レジストリは `RegistryStore` 越しに触るので、どの OS でもロジックをテストできる。

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::StartupError;
use super::approval;
use super::command::program_of;
use crate::model::{StartupEntry, StartupLocation};

pub const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const RUN32: &str = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";

fn approved(kind: &str) -> String {
    format!(r"{APPROVED}\{kind}")
}

/// レジストリのハイブ。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Hive {
    CurrentUser,
    LocalMachine,
}

/// スタートアップ管理で使うレジストリ操作。
pub trait RegistryStore {
    /// 文字列値（`REG_SZ` / `REG_EXPAND_SZ`）を名前と組で返す。キーが無ければ空。
    fn string_values(&self, hive: Hive, path: &str) -> Vec<(String, String)>;
    /// バイナリ値を返す。無ければ `None`。
    fn binary_value(&self, hive: Hive, path: &str, name: &str) -> Option<Vec<u8>>;
    /// バイナリ値を書き込む。キーが無ければ作る。
    fn set_binary_value(
        &self,
        hive: Hive,
        path: &str,
        name: &str,
        data: &[u8],
    ) -> Result<(), String>;
}

/// スタートアップフォルダーの場所。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StartupFolders {
    pub user: Option<PathBuf>,
    pub common: Option<PathBuf>,
}

impl StartupFolders {
    /// `%APPDATA%` と `%ProgramData%` から場所を決める。
    pub fn from_env(appdata: Option<&str>, program_data: Option<&str>) -> Self {
        let sub = Path::new("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs");
        Self {
            user: appdata
                .filter(|s| !s.is_empty())
                .map(|d| Path::new(d).join(&sub).join("Startup")),
            common: program_data
                .filter(|s| !s.is_empty())
                .map(|d| Path::new(d).join(&sub).join("StartUp")),
        }
    }
}

/// フォルダー内のファイル名（desktop.ini を除く）。
fn folder_files(dir: Option<&Path>) -> Vec<(String, PathBuf)> {
    let Some(Ok(read)) = dir.map(fs::read_dir) else {
        return Vec::new();
    };
    let mut files: Vec<(String, PathBuf)> = read
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter_map(|p| Some((p.file_name()?.to_str()?.to_owned(), p)))
        .filter(|(name, _)| !name.eq_ignore_ascii_case("desktop.ini"))
        .collect();
    files.sort();
    files
}

fn entry(
    location: StartupLocation,
    name: &str,
    command: String,
    enabled: bool,
    can_toggle: bool,
) -> StartupEntry {
    StartupEntry {
        id: format!("{}:{name}", location.key()),
        name: name.to_owned(),
        program: program_of(&command).to_owned(),
        command,
        location,
        enabled,
        can_toggle,
    }
}

/// Windows のスタートアップ項目を一覧にする。
pub fn list(store: &dyn RegistryStore, folders: &StartupFolders) -> Vec<StartupEntry> {
    let mut entries = Vec::new();
    let run_sources = [
        (Hive::CurrentUser, RUN, "Run", StartupLocation::RegistryUser),
        (
            Hive::LocalMachine,
            RUN,
            "Run",
            StartupLocation::RegistryMachine,
        ),
        (
            Hive::LocalMachine,
            RUN32,
            "Run32",
            StartupLocation::RegistryMachine,
        ),
    ];
    for (hive, path, approval_kind, location) in run_sources {
        for (name, command) in store.string_values(hive, path) {
            let flag = store.binary_value(hive, &approved(approval_kind), &name);
            let can_toggle = location == StartupLocation::RegistryUser;
            entries.push(entry(
                location,
                &name,
                command,
                approval::is_enabled(flag.as_deref()),
                can_toggle,
            ));
        }
    }
    let folder_sources = [
        (
            Hive::CurrentUser,
            folders.user.as_deref(),
            StartupLocation::FolderUser,
        ),
        (
            Hive::LocalMachine,
            folders.common.as_deref(),
            StartupLocation::FolderCommon,
        ),
    ];
    for (hive, dir, location) in folder_sources {
        for (file, path) in folder_files(dir) {
            let flag = store.binary_value(hive, &approved("StartupFolder"), &file);
            let display = Path::new(&file)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&file)
                .to_owned();
            let mut e = entry(
                location,
                &file,
                path.to_string_lossy().into_owned(),
                approval::is_enabled(flag.as_deref()),
                location == StartupLocation::FolderUser,
            );
            e.name = display;
            entries.push(e);
        }
    }
    let mut seen = HashSet::new();
    entries.retain(|e| seen.insert(e.id.clone()));
    entries.sort_by_key(|e| e.name.to_lowercase());
    entries
}

/// ユーザー単位の項目の有効・無効を切り替える。
pub fn set_enabled(
    store: &dyn RegistryStore,
    folders: &StartupFolders,
    location: StartupLocation,
    name: &str,
    enabled: bool,
) -> Result<(), StartupError> {
    let kind = match location {
        StartupLocation::RegistryUser => {
            let exists = store
                .string_values(Hive::CurrentUser, RUN)
                .iter()
                .any(|(n, _)| n == name);
            if !exists {
                return Err(StartupError::NotFound);
            }
            "Run"
        }
        StartupLocation::FolderUser => {
            let exists = folder_files(folders.user.as_deref())
                .iter()
                .any(|(n, _)| n == name);
            if !exists {
                return Err(StartupError::NotFound);
            }
            "StartupFolder"
        }
        _ => return Err(StartupError::NotToggleable),
    };
    store
        .set_binary_value(
            Hive::CurrentUser,
            &approved(kind),
            name,
            &approval::encode(enabled),
        )
        .map_err(StartupError::Io)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::startup::test_support::TempDir;
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    /// メモリ上の偽レジストリ。
    #[derive(Default)]
    struct FakeRegistry {
        strings: BTreeMap<(String, String), Vec<(String, String)>>,
        binaries: RefCell<BTreeMap<(String, String, String), Vec<u8>>>,
        fail_writes: bool,
    }

    fn hive_key(hive: Hive) -> String {
        format!("{hive:?}")
    }

    impl FakeRegistry {
        fn with_run(mut self, hive: Hive, path: &str, name: &str, command: &str) -> Self {
            self.strings
                .entry((hive_key(hive), path.to_owned()))
                .or_default()
                .push((name.to_owned(), command.to_owned()));
            self
        }

        fn with_flag(self, hive: Hive, kind: &str, name: &str, data: &[u8]) -> Self {
            self.binaries.borrow_mut().insert(
                (hive_key(hive), approved(kind), name.to_owned()),
                data.to_vec(),
            );
            self
        }
    }

    impl RegistryStore for FakeRegistry {
        fn string_values(&self, hive: Hive, path: &str) -> Vec<(String, String)> {
            self.strings
                .get(&(hive_key(hive), path.to_owned()))
                .cloned()
                .unwrap_or_default()
        }

        fn binary_value(&self, hive: Hive, path: &str, name: &str) -> Option<Vec<u8>> {
            self.binaries
                .borrow()
                .get(&(hive_key(hive), path.to_owned(), name.to_owned()))
                .cloned()
        }

        fn set_binary_value(
            &self,
            hive: Hive,
            path: &str,
            name: &str,
            data: &[u8],
        ) -> Result<(), String> {
            if self.fail_writes {
                return Err("access denied".to_owned());
            }
            self.binaries.borrow_mut().insert(
                (hive_key(hive), path.to_owned(), name.to_owned()),
                data.to_vec(),
            );
            Ok(())
        }
    }

    fn by_id<'a>(list: &'a [StartupEntry], id: &str) -> &'a StartupEntry {
        list.iter().find(|e| e.id == id).unwrap()
    }

    mod equivalence {
        use super::*;

        #[test]
        fn lists_run_keys_with_approval_flags() {
            let reg = FakeRegistry::default()
                .with_run(Hive::CurrentUser, RUN, "Chat", r#""C:\chat.exe" --min"#)
                .with_run(Hive::LocalMachine, RUN, "Driver", r"C:\drv.exe")
                .with_flag(Hive::CurrentUser, "Run", "Chat", &[3, 0, 0]);
            let list = list(&reg, &StartupFolders::default());
            let chat = by_id(&list, "registryUser:Chat");
            assert!(!chat.enabled);
            assert!(chat.can_toggle);
            assert_eq!(chat.program, r"C:\chat.exe");
            let driver = by_id(&list, "registryMachine:Driver");
            assert!(driver.enabled);
            assert!(!driver.can_toggle);
        }

        #[test]
        fn lists_startup_folder_files_without_desktop_ini() {
            let tmp = TempDir::new("win-folder");
            let user = tmp.path().join("user");
            fs::create_dir_all(&user).unwrap();
            fs::write(user.join("Notes.lnk"), b"x").unwrap();
            fs::write(user.join("desktop.ini"), b"x").unwrap();
            let folders = StartupFolders {
                user: Some(user),
                common: None,
            };
            let list = list(&FakeRegistry::default(), &folders);
            assert_eq!(list.len(), 1);
            assert_eq!(list[0].name, "Notes");
            assert_eq!(list[0].id, "folderUser:Notes.lnk");
            assert!(list[0].can_toggle);
        }

        #[test]
        fn toggling_user_run_entry_writes_approval_flag() {
            let reg = FakeRegistry::default().with_run(Hive::CurrentUser, RUN, "Chat", "chat.exe");
            let folders = StartupFolders::default();
            set_enabled(&reg, &folders, StartupLocation::RegistryUser, "Chat", false).unwrap();
            assert!(!list(&reg, &folders)[0].enabled);
            set_enabled(&reg, &folders, StartupLocation::RegistryUser, "Chat", true).unwrap();
            assert!(list(&reg, &folders)[0].enabled);
        }

        #[test]
        fn toggling_user_folder_entry() {
            let tmp = TempDir::new("win-folder-toggle");
            let user = tmp.path().to_path_buf();
            fs::write(user.join("App.lnk"), b"x").unwrap();
            let folders = StartupFolders {
                user: Some(user),
                common: None,
            };
            let reg = FakeRegistry::default();
            set_enabled(
                &reg,
                &folders,
                StartupLocation::FolderUser,
                "App.lnk",
                false,
            )
            .unwrap();
            assert!(!list(&reg, &folders)[0].enabled);
        }

        #[test]
        fn machine_entries_cannot_be_toggled() {
            let reg = FakeRegistry::default();
            let err = set_enabled(
                &reg,
                &StartupFolders::default(),
                StartupLocation::RegistryMachine,
                "X",
                false,
            )
            .unwrap_err();
            assert_eq!(err, StartupError::NotToggleable);
        }

        #[test]
        fn folders_from_env() {
            let f = StartupFolders::from_env(Some(r"C:\Users\u\AppData\Roaming"), Some(r"C:\PD"));
            assert!(f.user.unwrap().ends_with("Startup"));
            assert!(f.common.unwrap().ends_with("StartUp"));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_registry_and_folders() {
            assert_eq!(
                list(&FakeRegistry::default(), &StartupFolders::default()),
                Vec::new()
            );
        }

        #[test]
        fn folders_from_missing_env_are_none() {
            assert_eq!(
                StartupFolders::from_env(None, Some("")),
                StartupFolders::default()
            );
        }

        #[test]
        fn toggling_missing_entries_is_not_found() {
            let reg = FakeRegistry::default();
            let folders = StartupFolders::default();
            for loc in [StartupLocation::RegistryUser, StartupLocation::FolderUser] {
                let err = set_enabled(&reg, &folders, loc, "none", true).unwrap_err();
                assert_eq!(err, StartupError::NotFound);
            }
        }

        #[test]
        fn write_failure_is_reported() {
            let mut reg =
                FakeRegistry::default().with_run(Hive::CurrentUser, RUN, "Chat", "chat.exe");
            reg.fail_writes = true;
            let err = set_enabled(
                &reg,
                &StartupFolders::default(),
                StartupLocation::RegistryUser,
                "Chat",
                false,
            )
            .unwrap_err();
            assert_eq!(err, StartupError::Io("access denied".to_owned()));
        }

        #[test]
        fn duplicate_machine_entries_in_run_and_run32_are_merged() {
            let reg = FakeRegistry::default()
                .with_run(Hive::LocalMachine, RUN, "Same", "a.exe")
                .with_run(Hive::LocalMachine, RUN32, "Same", "b.exe");
            assert_eq!(list(&reg, &StartupFolders::default()).len(), 1);
        }
    }
}
