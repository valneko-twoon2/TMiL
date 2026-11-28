use taskmanagerlite_core::backend::Backend;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};

/// 画面の表示状態をフロントへ知らせるイベント名。非表示中は計測を止めてもらう。
pub(crate) const VISIBILITY_EVENT: &str = "window-visibility";

const MENU_OPEN: &str = "open";
const MENU_QUIT: &str = "quit";

/// 契約: トレイを作れたか。作れなかったときは、閉じてもトレイに隠れず終了する（戻る手段が無くなるため）。
pub(crate) struct TrayAvailable(pub(crate) bool);

/// なぜ: Linux でトレイ用のライブラリ（appindicator）が読み込めないと、ライブラリが panic で落ちる。
/// 画面は出せるので、トレイ無しで動かす。
pub(crate) fn try_create<R: Runtime>(app: &AppHandle<R>) -> bool {
    let created = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| create(app)));
    let ok = matches!(created, Ok(Ok(())));
    if !ok {
        #[expect(
            clippy::print_stderr,
            reason = "トレイ無しで動くことを知らせる手段が他に無い"
        )]
        {
            eprintln!("トレイを作れないので、トレイ無しで起動します。");
        }
    }
    ok
}

fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(
        app,
        MENU_OPEN,
        "Task Manager Lite を開く",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Task Manager Lite")
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

pub(crate) fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if app.state::<Backend>().window_shown().unwrap_or(false) {
            let _ = app.emit(VISIBILITY_EVENT, true);
        }
    }
}

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

fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    if app.state::<Backend>().quit().unwrap_or(true) {
        app.exit(0);
    }
}
