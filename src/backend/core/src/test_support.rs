//! テスト用の共通処理。

use std::process::{Child, Command, Stdio};

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
