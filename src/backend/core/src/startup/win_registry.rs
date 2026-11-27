//! `RegistryStore` の Windows 実装（winreg）。

use winreg::RegKey;
use winreg::RegValue;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, RegType};

use super::registry::{Hive, RegistryStore};

/// 実際のレジストリ。
#[derive(Debug, Clone, Copy, Default)]
pub struct WinRegistry;

fn root(hive: Hive) -> RegKey {
    RegKey::predef(match hive {
        Hive::CurrentUser => HKEY_CURRENT_USER,
        Hive::LocalMachine => HKEY_LOCAL_MACHINE,
    })
}

impl RegistryStore for WinRegistry {
    fn string_values(&self, hive: Hive, path: &str) -> Vec<(String, String)> {
        let Ok(key) = root(hive).open_subkey_with_flags(path, KEY_READ) else {
            return Vec::new();
        };
        key.enum_values()
            .filter_map(Result::ok)
            .filter(|(_, v)| matches!(v.vtype, RegType::REG_SZ | RegType::REG_EXPAND_SZ))
            .filter_map(|(name, _)| key.get_value::<String, _>(&name).ok().map(|s| (name, s)))
            .collect()
    }

    fn binary_value(&self, hive: Hive, path: &str, name: &str) -> Option<Vec<u8>> {
        let key = root(hive).open_subkey_with_flags(path, KEY_READ).ok()?;
        let value = key.get_raw_value(name).ok()?;
        (value.vtype == RegType::REG_BINARY).then(|| value.bytes.into_owned())
    }

    fn set_binary_value(
        &self,
        hive: Hive,
        path: &str,
        name: &str,
        data: &[u8],
    ) -> Result<(), String> {
        let (key, _) = root(hive)
            .create_subkey_with_flags(path, KEY_SET_VALUE)
            .map_err(|e| e.to_string())?;
        let value = RegValue {
            bytes: data.into(),
            vtype: RegType::REG_BINARY,
        };
        key.set_raw_value(name, &value).map_err(|e| e.to_string())
    }
}

/// HKLM の文字列値を 1 つ読む（タスクマネージャー置き換えの確認用）。
pub fn read_machine_string(path: &str, name: &str) -> Option<String> {
    root(Hive::LocalMachine)
        .open_subkey_with_flags(path, KEY_READ)
        .ok()?
        .get_value::<String, _>(name)
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::startup::registry::RUN;

    mod equivalence {
        use super::*;

        #[test]
        fn reading_run_key_does_not_fail() {
            let values = WinRegistry.string_values(Hive::CurrentUser, RUN);
            assert!(values.iter().all(|(name, _)| !name.is_empty()));
        }

        #[test]
        fn writes_and_reads_binary_value_in_test_key() {
            let path = format!(r"Software\TaskManagerLite-test-{}", std::process::id());
            WinRegistry
                .set_binary_value(Hive::CurrentUser, &path, "flag", &[3, 0])
                .unwrap();
            let read = WinRegistry.binary_value(Hive::CurrentUser, &path, "flag");
            let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&path);
            assert_eq!(read, Some(vec![3, 0]));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn missing_key_gives_empty_and_none() {
            let path = r"Software\TaskManagerLite-does-not-exist";
            assert_eq!(
                WinRegistry.string_values(Hive::CurrentUser, path),
                Vec::new()
            );
            assert_eq!(WinRegistry.binary_value(Hive::CurrentUser, path, "x"), None);
            assert_eq!(read_machine_string(path, "x"), None);
        }
    }
}
