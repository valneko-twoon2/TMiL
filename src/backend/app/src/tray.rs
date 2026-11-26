//! トレイアイコンとウィンドウの表示切り替え。
//! 表示・非表示・終了は状態機械に伝え、返ってきた判断のとおりに画面へ知らせる。

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};
use tmil_core::backend::Backend;

/// 画面の表示状態をフロントへ知らせるイベント名。非表示中は計測を止めてもらう。
pub(crate) const VISIBILITY_EVENT: &str = "window-visibility";

const MENU_OPEN: &str = "open";
const MENU_QUIT: &str = "quit";

/// トレイアイコンを作る。
pub(crate) fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, MENU_OPEN, "TMiL を開く", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("TMiL")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            MENU_OPEN => show_main_window(app),
            MENU_QUIT => request_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// メインウィンドウを前面に出す。
pub(crate) fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        // 表示の切り替えに失敗しても次の操作で再試行できるので、結果は捨てる
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if app.state::<Backend>().window_shown().unwrap_or(false) {
            let _ = app.emit(VISIBILITY_EVENT, true);
        }
    }
}

/// ウィンドウを隠してトレイに常駐させる。
pub(crate) fn hide_window<R: Runtime>(window: &Window<R>) {
    let _ = window.hide();
    if window
        .app_handle()
        .state::<Backend>()
        .window_hidden()
        .unwrap_or(false)
    {
        let _ = window.emit(VISIBILITY_EVENT, false);
    }
}

/// 終了する。状態機械が「終了してよい」と判断したときだけ終える。
fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    if app.state::<Backend>().quit().unwrap_or(true) {
        app.exit(0);
    }
}
