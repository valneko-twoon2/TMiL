//! TaskManagerLite のコア機能。Tauri に依存しない処理（システム情報の取得、スタートアップ管理など）をまとめる。

pub mod backend;
pub mod base64;
pub mod collector;
pub mod connections;
pub mod gpu;
pub mod icons;
pub mod launch;
pub mod machine;
pub mod metrics;
pub mod model;
pub mod modules;
pub mod open;
pub mod powershell;
pub mod process_control;
pub mod procfs;
pub mod services;
pub mod startup;
pub mod taskmgr;
pub mod windows_list;

#[cfg(test)]
mod test_support;
