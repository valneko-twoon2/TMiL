//! Linux（freedesktop）の autostart ディレクトリを扱う。
//! ディレクトリを引数で受け取るので、どの OS でもテストできる。

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::StartupError;
use super::command::program_of;
use super::desktop;
use crate::model::{StartupEntry, StartupLocation};

/// 環境変数から autostart ディレクトリ（ユーザー用, システム用の一覧）を決める。
pub fn default_dirs(
    config_home: Option<&str>,
    home: Option<&str>,
    config_dirs: Option<&str>,
) -> (PathBuf, Vec<PathBuf>) {
    let user = match (config_home.filter(|s| !s.is_empty()), home) {
        (Some(dir), _) => PathBuf::from(dir),
        (None, Some(h)) => Path::new(h).join(".config"),
        (None, None) => PathBuf::from(".config"),
    }
    .join("autostart");
    let system = config_dirs
        .filter(|s| !s.is_empty())
        .unwrap_or("/etc/xdg")
        .split(':')
        .filter(|s| !s.is_empty())
        .map(|d| Path::new(d).join("autostart"))
        .collect();
    (user, system)
}

/// ディレクトリ内の `.desktop` ファイル名を返す。読めなければ空。
fn desktop_files(dir: &Path) -> Vec<String> {
    let Ok(read) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = read
        .filter_map(Result::ok)
        .filter(|e| e.path().is_file())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.ends_with(".desktop"))
        .collect();
    names.sort();
    names
}

/// autostart の項目を一覧にする。同じファイル名はユーザー用が優先、システム用は先のものが優先。
pub fn list_in(user_dir: &Path, system_dirs: &[PathBuf]) -> Vec<StartupEntry> {
    let mut found: BTreeMap<String, (StartupLocation, PathBuf)> = BTreeMap::new();
    for dir in system_dirs.iter().rev() {
        for name in desktop_files(dir) {
            let path = dir.join(&name);
            found.insert(name, (StartupLocation::AutostartSystem, path));
        }
    }
    for name in desktop_files(user_dir) {
        let path = user_dir.join(&name);
        found.insert(name, (StartupLocation::AutostartUser, path));
    }

    let mut entries: Vec<StartupEntry> = found
        .into_iter()
        .filter_map(|(file, (location, path))| {
            let content = fs::read_to_string(&path).ok()?;
            let parsed = desktop::parse(&content);
            let command = parsed.exec.clone().unwrap_or_default();
            Some(StartupEntry {
                id: format!("{}:{file}", location.key()),
                name: parsed
                    .name
                    .clone()
                    .unwrap_or_else(|| file.trim_end_matches(".desktop").to_owned()),
                program: program_of(&command).to_owned(),
                command,
                location,
                enabled: parsed.is_enabled(),
                can_toggle: true,
            })
        })
        .collect();
    entries.sort_by_key(|e| e.name.to_lowercase());
    entries
}

/// ファイル名として安全か（パス区切りや `..` を含まない `.desktop`）。
pub fn is_safe_file_name(name: &str) -> bool {
    name.ends_with(".desktop")
        && name.len() > ".desktop".len()
        && !name.contains(['/', '\\', '\0'])
        && !name.starts_with('.')
}

/// 有効・無効を切り替える。システム側の項目はユーザー用ディレクトリに上書き用のコピーを作る。
pub fn set_enabled_in(
    user_dir: &Path,
    system_dirs: &[PathBuf],
    file_name: &str,
    enabled: bool,
) -> Result<(), StartupError> {
    if !is_safe_file_name(file_name) {
        return Err(StartupError::InvalidId);
    }
    let source = std::iter::once(user_dir)
        .chain(system_dirs.iter().map(PathBuf::as_path))
        .map(|d| d.join(file_name))
        .find(|p| p.is_file())
        .ok_or(StartupError::NotFound)?;
    let content = fs::read_to_string(&source).map_err(|e| StartupError::Io(e.to_string()))?;
    fs::create_dir_all(user_dir).map_err(|e| StartupError::Io(e.to_string()))?;
    fs::write(
        user_dir.join(file_name),
        desktop::with_enabled(&content, enabled),
    )
    .map_err(|e| StartupError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::startup::test_support::TempDir;

    fn write(dir: &Path, name: &str, body: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(name), body).unwrap();
    }

    mod equivalence {
        use super::*;

        #[test]
        fn user_entry_overrides_system_entry_with_same_name() {
            let tmp = TempDir::new("xdg-override");
            let (user, sys) = (tmp.path().join("user"), tmp.path().join("sys"));
            write(
                &sys,
                "a.desktop",
                "[Desktop Entry]\nName=System A\nExec=/bin/a\n",
            );
            write(
                &user,
                "a.desktop",
                "[Desktop Entry]\nName=User A\nHidden=true\n",
            );
            let list = list_in(&user, std::slice::from_ref(&sys));
            assert_eq!(list.len(), 1);
            assert_eq!(list[0].name, "User A");
            assert_eq!(list[0].location, StartupLocation::AutostartUser);
            assert!(!list[0].enabled);
        }

        #[test]
        fn earlier_system_dir_has_priority() {
            let tmp = TempDir::new("xdg-priority");
            let (first, second) = (tmp.path().join("first"), tmp.path().join("second"));
            write(&first, "a.desktop", "[Desktop Entry]\nName=First\n");
            write(&second, "a.desktop", "[Desktop Entry]\nName=Second\n");
            let list = list_in(&tmp.path().join("none"), &[first, second]);
            assert_eq!(list[0].name, "First");
        }

        #[test]
        fn disabling_system_entry_creates_user_copy() {
            let tmp = TempDir::new("xdg-toggle");
            let (user, sys) = (tmp.path().join("user"), tmp.path().join("sys"));
            write(
                &sys,
                "a.desktop",
                "[Desktop Entry]\nName=A\nExec=/bin/a -x\n",
            );
            set_enabled_in(&user, std::slice::from_ref(&sys), "a.desktop", false).unwrap();
            let list = list_in(&user, std::slice::from_ref(&sys));
            assert!(!list[0].enabled);
            assert_eq!(list[0].program, "/bin/a");
            set_enabled_in(&user, std::slice::from_ref(&sys), "a.desktop", true).unwrap();
            assert!(list_in(&user, &[sys])[0].enabled);
        }

        #[test]
        fn default_dirs_from_environment() {
            let (user, sys) = default_dirs(Some("/cfg"), Some("/home/u"), Some("/a:/b"));
            assert_eq!(user, Path::new("/cfg").join("autostart"));
            assert_eq!(
                sys,
                vec![
                    Path::new("/a").join("autostart"),
                    Path::new("/b").join("autostart")
                ]
            );
        }

        #[test]
        fn default_dirs_fall_back_to_home_and_etc() {
            let (user, sys) = default_dirs(None, Some("/home/u"), None);
            assert_eq!(user, Path::new("/home/u").join(".config").join("autostart"));
            assert_eq!(sys, vec![Path::new("/etc/xdg").join("autostart")]);
        }

        #[test]
        fn unsafe_file_names_are_rejected() {
            for name in [
                "../x.desktop",
                "a/b.desktop",
                r"a\b.desktop",
                "x.txt",
                ".desktop",
            ] {
                assert!(!is_safe_file_name(name), "{name}");
            }
            assert!(is_safe_file_name("ok.desktop"));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn missing_directories_give_empty_list() {
            let tmp = TempDir::new("xdg-missing");
            assert_eq!(
                list_in(&tmp.path().join("none"), &[tmp.path().join("nope")]),
                Vec::new()
            );
        }

        #[test]
        fn name_falls_back_to_file_stem_and_non_desktop_files_are_ignored() {
            let tmp = TempDir::new("xdg-stem");
            write(tmp.path(), "noname.desktop", "[Desktop Entry]\n");
            write(tmp.path(), "readme.txt", "x");
            let list = list_in(tmp.path(), &[]);
            assert_eq!(list.len(), 1);
            assert_eq!(list[0].name, "noname");
            assert_eq!(list[0].command, "");
        }

        #[test]
        fn empty_env_values_are_ignored() {
            let (user, sys) = default_dirs(Some(""), None, Some(""));
            assert_eq!(user, Path::new(".config").join("autostart"));
            assert_eq!(sys, vec![Path::new("/etc/xdg").join("autostart")]);
        }

        #[test]
        fn toggling_unknown_file_is_not_found() {
            let tmp = TempDir::new("xdg-notfound");
            let err = set_enabled_in(tmp.path(), &[], "none.desktop", false).unwrap_err();
            assert_eq!(err, StartupError::NotFound);
        }

        #[test]
        fn toggling_with_unsafe_name_is_invalid() {
            let tmp = TempDir::new("xdg-invalid");
            let err = set_enabled_in(tmp.path(), &[], "../evil.desktop", false).unwrap_err();
            assert_eq!(err, StartupError::InvalidId);
        }
    }
}
