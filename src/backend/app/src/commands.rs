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

async fn blocking<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&Backend) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || work(&app.state::<Backend>()))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))?
}

#[tauri::command]
pub(crate) async fn snapshot(app: AppHandle) -> Result<SnapshotWire, String> {
    blocking(app, |b| b.snapshot().map(|s| SnapshotWire::from(&s))).await
}

#[tauri::command]
pub(crate) async fn process_details(
    app: AppHandle,
    pids: Vec<u32>,
) -> Result<Vec<ProcessDetails>, String> {
    blocking(app, move |b| b.process_details(&pids)).await
}

#[tauri::command]
pub(crate) async fn system_info(app: AppHandle) -> Result<SystemInfo, String> {
    blocking(app, Backend::system_info).await
}

#[tauri::command]
pub(crate) async fn kill_processes(
    app: AppHandle,
    targets: Vec<KillTarget>,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.kill(&targets)).await
}

#[tauri::command]
pub(crate) async fn set_process_priority(
    app: AppHandle,
    targets: Vec<KillTarget>,
    priority: Priority,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.set_priority(&targets, priority)).await
}

#[tauri::command]
pub(crate) async fn set_process_affinity(
    app: AppHandle,
    targets: Vec<KillTarget>,
    cpus: Vec<u32>,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.set_affinity(&targets, &cpus)).await
}

#[tauri::command]
pub(crate) async fn suspend_processes(
    app: AppHandle,
    targets: Vec<KillTarget>,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.suspend(&targets)).await
}

#[tauri::command]
pub(crate) async fn resume_processes(
    app: AppHandle,
    targets: Vec<KillTarget>,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.resume(&targets)).await
}

#[tauri::command]
pub(crate) async fn set_process_efficiency(
    app: AppHandle,
    targets: Vec<KillTarget>,
    enabled: bool,
) -> Result<Vec<KillResult>, String> {
    blocking(app, move |b| b.set_efficiency(&targets, enabled)).await
}

#[tauri::command]
pub(crate) async fn process_controls(pid: u32) -> Result<ProcessControls, String> {
    tauri::async_runtime::spawn_blocking(move || Backend::controls(pid))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))
}

#[tauri::command]
pub(crate) async fn startup_entries() -> Result<Vec<StartupEntry>, String> {
    tauri::async_runtime::spawn_blocking(startup::list)
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))
}

#[tauri::command]
pub(crate) async fn set_startup_enabled(id: String, enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        startup::set_enabled(&id, enabled).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("処理が中断されました: {e}"))?
}

#[tauri::command]
pub(crate) async fn taskmgr_replacement(app: AppHandle) -> Result<ReplacementStatus, String> {
    let exe = current_exe()?;
    blocking(app, move |b| b.replacement_status(|| taskmgr::status(&exe))).await
}

#[tauri::command]
pub(crate) async fn set_taskmgr_replacement(
    app: AppHandle,
    enabled: bool,
) -> Result<ReplacementStatus, String> {
    let exe = current_exe()?;
    blocking(app, move |b| set_replacement_for_exe(b, &exe, enabled)).await
}

#[tauri::command]
pub(crate) async fn process_icons(
    app: AppHandle,
    exes: Vec<String>,
) -> Result<Vec<ProcessIcon>, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<IconCache>().icons(&exes, icons::load))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))
}

#[tauri::command]
pub(crate) async fn reveal_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open::reveal(&path))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))?
}

#[tauri::command]
pub(crate) async fn search_online(query: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open::search_online(&query))
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))?
}

#[tauri::command]
pub(crate) async fn run_task(command: String, admin: bool) -> Result<(), String> {
    detached(move || launch::run(&command, admin)).await?
}

#[tauri::command]
pub(crate) async fn app_windows() -> Result<Vec<AppWindow>, String> {
    detached(windows_list::list).await
}

#[tauri::command]
pub(crate) async fn switch_to_window(pid: u32) -> Result<(), String> {
    detached(move || windows_list::switch_to(pid)).await?
}

#[tauri::command]
pub(crate) async fn services() -> Result<Vec<ServiceInfo>, String> {
    detached(services::list).await?
}

#[tauri::command]
pub(crate) async fn control_service(name: String, action: ServiceAction) -> Result<(), String> {
    detached(move || services::control(&name, action)).await?
}

#[tauri::command]
pub(crate) async fn open_services_tool() -> Result<(), String> {
    detached(open::open_services_tool).await?
}

#[tauri::command]
pub(crate) async fn network_connections() -> Result<Vec<Connection>, String> {
    detached(connections::list).await?
}

#[tauri::command]
pub(crate) async fn process_modules(pid: u32) -> Result<Vec<ModuleInfo>, String> {
    detached(move || modules::list(pid)).await?
}

#[tauri::command]
pub(crate) async fn find_handles(query: String) -> Result<Vec<HandleInfo>, String> {
    detached(move || handles::find(&query)).await?
}

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

async fn detached<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("処理が中断されました: {e}"))
}
