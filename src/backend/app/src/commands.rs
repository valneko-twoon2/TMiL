//! フロントエンドから呼ぶコマンド。判断は tmil-core の状態機械に任せ、ここは受け渡しだけにする。

use tauri::State;
use tmil_core::backend::{Backend, set_replacement_for_exe};
use tmil_core::model::{
    KillResult, KillTarget, ReplacementStatus, Snapshot, StartupEntry, SystemInfo,
};
use tmil_core::{startup, taskmgr};

fn current_exe() -> Result<std::path::PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("実行ファイルの場所が分かりません: {e}"))
}

/// 最新の計測結果。
#[tauri::command]
pub(crate) async fn snapshot(backend: State<'_, Backend>) -> Result<Snapshot, String> {
    backend.snapshot()
}

/// 変化しないシステム情報。
#[tauri::command]
pub(crate) async fn system_info(backend: State<'_, Backend>) -> Result<SystemInfo, String> {
    backend.system_info()
}

/// プロセスを終了する。
#[tauri::command]
pub(crate) async fn kill_processes(
    backend: State<'_, Backend>,
    targets: Vec<KillTarget>,
) -> Result<Vec<KillResult>, String> {
    backend.kill(&targets)
}

/// スタートアップ項目の一覧（状態を持たない処理なので状態機械は通さない）。
#[tauri::command]
pub(crate) async fn startup_entries() -> Result<Vec<StartupEntry>, String> {
    Ok(startup::list())
}

/// スタートアップ項目の有効・無効を切り替える（状態を持たない処理）。
#[tauri::command]
pub(crate) async fn set_startup_enabled(id: String, enabled: bool) -> Result<(), String> {
    startup::set_enabled(&id, enabled).map_err(|e| e.to_string())
}

/// タスク マネージャー置き換えの状態。
#[tauri::command]
pub(crate) async fn taskmgr_replacement(
    backend: State<'_, Backend>,
) -> Result<ReplacementStatus, String> {
    let exe = current_exe()?;
    backend.replacement_status(|| taskmgr::status(&exe))
}

/// タスク マネージャー置き換えを切り替える（Windows では UAC の確認が出る）。
#[tauri::command]
pub(crate) async fn set_taskmgr_replacement(
    backend: State<'_, Backend>,
    enabled: bool,
) -> Result<ReplacementStatus, String> {
    set_replacement_for_exe(&backend, &current_exe()?, enabled)
}
