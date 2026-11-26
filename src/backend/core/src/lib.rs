//! TMiL のコア機能。Tauri に依存しない処理（システム情報の取得、スタートアップ管理など）をまとめる。

pub mod collector;
pub mod metrics;
pub mod model;
pub mod startup;
pub mod taskmgr;
