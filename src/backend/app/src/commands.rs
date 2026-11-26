//! フロントエンドから呼ぶコマンド。判断は tmil-core の状態機械に任せ、ここは受け渡しだけにする。
//!
//! 計測やプロセス終了、UAC の確認待ちはスレッドを止めるので、非同期の実行環境では行わず
//! `spawn_blocking` で専用のスレッドに回す。

use tauri::{AppHandle, Manager};
use tmil_core::backend::{Backend, set_replacement_for_exe};
use tmil_core::icons::{self, IconCache};
use tmil_core::model::{
    KillResult, KillTarget, Priority, ProcessControls, ProcessIcon, ReplacementStatus, Snapshot,
    StartupEntry, SystemInfo,
};
use tmil_core::{open, startup, taskmgr};

fn current_exe() -> Result<std::path::PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("実行ファイルの場所が分かりません: {e}"))
}

/// 止まる処理を専用のスレッドで行う。
async fn blocking<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&Backend) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || work(&app.state::<Backend>()))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))?
}

/// 最新の計測結果。
#[tauri::command]
pub(crate) async fn snapshot(app: AppHandle) -> Result<Snapshot, String> {
    blocking(app, Backend::snapshot).await
}

/// 変化しないシステム情報。
#[tauri::command]
pub(crate) async fn system_info(app: AppHandle) -> Result<SystemInfo, String> {
    blocking(app, Backend::system_info).await
}

/// プロセスを終了する。
#[tauri::command]
pub(crate) async fn kill_processes(
    app: AppHandle,
    targets: Vec<KillTarget>,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.kill(&targets)).await
}

/// プロセスの優先度を変える。
#[tauri::command]
pub(crate) async fn set_process_priority(
    app: AppHandle,
    targets: Vec<KillTarget>,
    priority: Priority,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.set_priority(&targets, priority)).await
}

/// プロセスの関係（動かしてよい CPU）を変える。
#[tauri::command]
pub(crate) async fn set_process_affinity(
    app: AppHandle,
    targets: Vec<KillTarget>,
    cpus: Vec<u32>,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.set_affinity(&targets, &cpus)).await
}

/// プロセスの今の優先度と関係（読むだけなので状態機械は通さない）。
#[tauri::command]
pub(crate) async fn process_controls(pid: u32) -> Result<ProcessControls, String> {
    tauri::async_runtime::spawn_blocking(move || Backend::controls(pid))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))
}

/// スタートアップ項目の一覧（状態を持たない処理なので状態機械は通さない）。
#[tauri::command]
pub(crate) async fn startup_entries() -> Result<Vec<StartupEntry>, String> {
    tauri::async_runtime::spawn_blocking(startup::list)
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))
}

/// スタートアップ項目の有効・無効を切り替える（状態を持たない処理）。
#[tauri::command]
pub(crate) async fn set_startup_enabled(id: String, enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        startup::set_enabled(&id, enabled).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("処理が中断されました: {e}"))?
}

/// タスク マネージャー置き換えの状態。
#[tauri::command]
pub(crate) async fn taskmgr_replacement(app: AppHandle) -> Result<ReplacementStatus, String> {
    let exe = current_exe()?;
    blocking(app, move |b| b.replacement_status(|| taskmgr::status(&exe))).await
}

/// タスク マネージャー置き換えを切り替える（Windows では UAC の確認が出る）。
#[tauri::command]
pub(crate) async fn set_taskmgr_replacement(
    app: AppHandle,
    enabled: bool,
) -> Result<ReplacementStatus, String> {
    let exe = current_exe()?;
    blocking(app, move |b| set_replacement_for_exe(b, &exe, enabled)).await
}

/// 実行ファイルのアイコン（状態を持たない読み取り。一度調べたものは覚えておく）。
#[tauri::command]
pub(crate) async fn process_icons(
    app: AppHandle,
    exes: Vec<String>,
) -> Result<Vec<ProcessIcon>, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<IconCache>().icons(&exes, icons::load))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))
}

/// ファイルの場所を開く（状態を持たない操作）。
#[tauri::command]
pub(crate) async fn reveal_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open::reveal(&path))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))?
}

/// プロセスの名前などをブラウザーで検索する（状態を持たない操作）。
#[tauri::command]
pub(crate) async fn search_online(query: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open::search_online(&query))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))?
}
