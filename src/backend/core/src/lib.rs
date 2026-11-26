//! TMiL のコア機能。Tauri に依存しない処理（システム情報の取得、スタートアップ管理など）をまとめる。

pub mod backend;
pub mod collector;
pub mod icons;
pub mod machine;
pub mod metrics;
pub mod model;
pub mod open;
pub mod powershell;
pub mod process_control;
pub mod startup;
pub mod taskmgr;

#[cfg(test)]
mod test_support;
