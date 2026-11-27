//! テスト用の共通処理。

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

/// テストが読むリポジトリ直下（tests/formal など）の場所を決める（純粋関数）。
/// ミューテーションテストは src/backend だけを別の場所に写して動かすので、
/// そのときは `TASKMANAGERLITE_REPO_ROOT` で本来の場所を教える。無ければ core から 3 つ上。
pub(crate) fn repo_root_from(env: Option<OsString>, manifest_dir: &Path) -> PathBuf {
    env.filter(|v| !v.is_empty())
        .map_or_else(|| manifest_dir.join("../../.."), PathBuf::from)
}

/// リポジトリ直下。
pub(crate) fn repo_root() -> PathBuf {
    repo_root_from(
        std::env::var_os("TASKMANAGERLITE_REPO_ROOT"),
        Path::new(env!("CARGO_MANIFEST_DIR")),
    )
}

/// しばらく動き続ける子プロセスを起動する（終了のテスト用）。
pub(crate) fn spawn_sleeper() -> Child {
    if cfg!(windows) {
        Command::new("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(Stdio::null())
            .spawn()
    } else {
        Command::new("sleep").arg("30").spawn()
    }
    .expect("spawn child")
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn without_env_root_is_three_levels_above_core() {
            assert_eq!(
                repo_root_from(None, Path::new("/r/src/backend/core")),
                Path::new("/r/src/backend/core/../../..")
            );
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_env_is_ignored() {
            let root = repo_root_from(Some(OsString::new()), Path::new("/r/src/backend/core"));
            assert_eq!(root, Path::new("/r/src/backend/core/../../.."));
        }
    }

    mod regression {
        use super::*;

        // ミューテーションテストは src/backend だけを写すので、tests/formal などが見つからず全部失敗していた
        #[test]
        fn env_points_to_real_repository_when_copied() {
            let root = repo_root_from(
                Some(OsString::from("/real/repo")),
                Path::new("/tmp/copy/core"),
            );
            assert_eq!(root, Path::new("/real/repo"));
        }
    }
}
