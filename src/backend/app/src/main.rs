//! TaskManagerLite のエントリーポイント。ウィンドウを閉じてもトレイに常駐する。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod tray;

use taskmanagerlite_core::backend::Backend;
use taskmanagerlite_core::icons::IconCache;
use tauri::WindowEvent;

fn main() {
    if let Err(err) = run() {
        #[expect(clippy::print_stderr, reason = "起動失敗を知らせる手段が他に無い")]
        {
            eprintln!("TaskManagerLite を起動できませんでした: {err}");
        }
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let backend = Backend::new()?;
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 2 つ目の起動（タスク マネージャー置き換え経由を含む）は既存のウィンドウを出す
            tray::show_main_window(app);
        }))
        .manage(backend)
        .manage(IconCache::new())
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::system_info,
            commands::kill_processes,
            commands::startup_entries,
            commands::set_startup_enabled,
            commands::taskmgr_replacement,
            commands::set_taskmgr_replacement,
            commands::process_icons,
            commands::reveal_file,
            commands::set_process_priority,
            commands::set_process_affinity,
            commands::process_controls,
            commands::search_online,
        ])
        .setup(|app| {
            tray::create(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 閉じるボタンではトレイに隠すだけにする
                api.prevent_close();
                tray::hide_window(window);
            }
        })
        .run(tauri::generate_context!())?;
    Ok(())
}
