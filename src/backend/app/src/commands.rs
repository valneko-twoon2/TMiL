//! フロントエンドから呼ぶコマンド。判断は taskmanagerlite-core の状態機械に任せ、ここは受け渡しだけにする。
//!
//! 計測やプロセス終了、UAC の確認待ちはスレッドを止めるので、非同期の実行環境では行わず
//! `spawn_blocking` で専用のスレッドに回す。

use taskmanagerlite_core::backend::{Backend, set_replacement_for_exe};
use taskmanagerlite_core::icons::{self, IconCache};
use taskmanagerlite_core::model::{
    AppWindow, Connection, HandleInfo, KillResult, KillTarget, ModuleInfo, Priority,
    ProcessControls, ProcessDetails, ProcessIcon, ReplacementStatus, ServiceAction, ServiceInfo,
    SnapshotWire, StartupEntry, SystemInfo,
};
use taskmanagerlite_core::{
    connections, handles, launch, modules, open, services, startup, taskmgr, windows_list,
};
use tauri::{AppHandle, Manager};

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

/// 最新の計測結果（転送量を減らした形）。
#[tauri::command]
pub(crate) async fn snapshot(app: AppHandle) -> Result<SnapshotWire, String> {
    blocking(app, |b| b.snapshot().map(|s| SnapshotWire::from(&s))).await
}

/// プロセスのほぼ変わらない項目（新しく出てきたプロセスの分だけ、画面が取りに来る）。
#[tauri::command]
pub(crate) async fn process_details(
    app: AppHandle,
    pids: Vec<u32>,
) -> Result<Vec<ProcessDetails>, String> {
    blocking(app, move |b| b.process_details(&pids)).await
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

/// プロセスを中断する。
#[tauri::command]
pub(crate) async fn suspend_processes(
    app: AppHandle,
    targets: Vec<KillTarget>,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.suspend(&targets)).await
}

/// 中断したプロセスを再開する。
#[tauri::command]
pub(crate) async fn resume_processes(
    app: AppHandle,
    targets: Vec<KillTarget>,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.resume(&targets)).await
}

/// 効率モードを入れる・外す。
#[tauri::command]
pub(crate) async fn set_process_efficiency(
    app: AppHandle,
    targets: Vec<KillTarget>,
    enabled: bool,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.set_efficiency(&targets, enabled)).await
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

/// 新しいタスクを実行する（利用者が入力したものを起動するだけで、状態を持たない）。
#[tauri::command]
pub(crate) async fn run_task(command: String, admin: bool) -> Result<(), String> {
    detached(move || launch::run(&command, admin)).await?
}

/// ウィンドウを出しているプロセスの一覧（読むだけ）。
#[tauri::command]
pub(crate) async fn app_windows() -> Result<Vec<AppWindow>, String> {
    detached(windows_list::list).await
}

/// そのプロセスのウィンドウに切り替える（ほかのアプリを前に出すだけ）。
#[tauri::command]
pub(crate) async fn switch_to_window(pid: u32) -> Result<(), String> {
    detached(move || windows_list::switch_to(pid)).await?
}

/// サービスの一覧（読むだけ）。
#[tauri::command]
pub(crate) async fn services() -> Result<Vec<ServiceInfo>, String> {
    detached(services::list).await?
}

/// サービスを開始・停止・再起動する（OS に頼むだけで、状態を持たない）。
#[tauri::command]
pub(crate) async fn control_service(name: String, action: ServiceAction) -> Result<(), String> {
    detached(move || services::control(&name, action)).await?
}

/// サービス管理ツールを開く。
#[tauri::command]
pub(crate) async fn open_services_tool() -> Result<(), String> {
    detached(open::open_services_tool).await?
}

/// ネットワークの接続と待ち受けの一覧（読むだけ）。
#[tauri::command]
pub(crate) async fn network_connections() -> Result<Vec<Connection>, String> {
    detached(connections::list).await?
}

/// プロセスが読み込んでいるモジュール（読むだけ）。
#[tauri::command]
pub(crate) async fn process_modules(pid: u32) -> Result<Vec<ModuleInfo>, String> {
    detached(move || modules::list(pid)).await?
}

/// ファイルやフォルダーを開いているプロセス（読むだけ）。
#[tauri::command]
pub(crate) async fn find_handles(query: String) -> Result<Vec<HandleInfo>, String> {
    detached(move || handles::find(&query)).await?
}

/// ウィンドウを常に手前に出すかを切り替える。
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri のコマンドはウィンドウを値で受け取る"
)]
pub(crate) fn set_always_on_top(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| format!("ウィンドウの設定を変えられません: {e}"))
}

/// 状態を持たない、止まる処理を専用のスレッドで行う。
async fn detached<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))
}
