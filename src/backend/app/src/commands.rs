//! フロントエンドから呼ぶコマンド。処理は tmil-core に任せ、ここは受け渡しだけにする。

use std::sync::MutexGuard;

use tauri::State;
use tmil_core::collector::Collector;
use tmil_core::model::{
    KillResult, KillTarget, ReplacementStatus, Snapshot, StartupEntry, SystemInfo,
};
use tmil_core::{startup, taskmgr};

use crate::AppState;

fn collector<'a>(state: &'a State<'_, AppState>) -> Result<MutexGuard<'a, Collector>, String> {
    state
        .collector
        .lock()
        .map_err(|_| "内部状態が壊れました。アプリを再起動してください。".to_owned())
}

fn current_exe() -> Result<std::path::PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("実行ファイルの場所が分かりません: {e}"))
}

/// 最新の計測結果。
#[tauri::command]
pub(crate) async fn snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    Ok(collector(&state)?.snapshot())
}

/// 変化しないシステム情報。
#[tauri::command]
pub(crate) async fn system_info(state: State<'_, AppState>) -> Result<SystemInfo, String> {
    Ok(collector(&state)?.system_info())
}

/// プロセスを終了する。
#[tauri::command]
pub(crate) async fn kill_processes(
    state: State<'_, AppState>,
    targets: Vec<KillTarget>,
) -> Result<Vec<KillResult>, String> {
    Ok(collector(&state)?.kill(&targets))
}

/// スタートアップ項目の一覧。
#[tauri::command]
pub(crate) async fn startup_entries() -> Result<Vec<StartupEntry>, String> {
    Ok(startup::list())
}

/// スタートアップ項目の有効・無効を切り替える。
#[tauri::command]
pub(crate) async fn set_startup_enabled(id: String, enabled: bool) -> Result<(), String> {
    startup::set_enabled(&id, enabled).map_err(|e| e.to_string())
}

/// タスク マネージャー置き換えの状態。
#[tauri::command]
pub(crate) async fn taskmgr_replacement() -> Result<ReplacementStatus, String> {
    Ok(taskmgr::status(&current_exe()?))
}

/// タスク マネージャー置き換えを切り替える（Windows では UAC の確認が出る）。
#[tauri::command]
pub(crate) async fn set_taskmgr_replacement(enabled: bool) -> Result<ReplacementStatus, String> {
    taskmgr::set(&current_exe()?, enabled)
}
