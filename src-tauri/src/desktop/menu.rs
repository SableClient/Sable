#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "macos")]
pub const SETTINGS_MENU_ID: &str = "settings";

pub const TOGGLE_WINDOW_ACCELERATOR: &str = "CmdOrCtrl+Shift+S";

// Extend the standard menu (Edit submenu for webview copy/paste, Quit, Close)
// with a Settings item.
#[cfg(target_os = "macos")]
pub fn build_app_menu(
    handle: &AppHandle<crate::BrowserEngine>,
) -> tauri::Result<tauri::menu::Menu<crate::BrowserEngine>> {
    use tauri::menu::{Menu, MenuItem, Submenu};

    let menu = Menu::default(handle)?;
    let settings = MenuItem::with_id(
        handle,
        SETTINGS_MENU_ID,
        "Settings…",
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let preferences = Submenu::with_items(handle, "Preferences", true, &[&settings])?;
    menu.append(&preferences)?;
    Ok(menu)
}

#[cfg(target_os = "macos")]
pub fn handle_menu_event(app: &AppHandle<crate::BrowserEngine>, event: &tauri::menu::MenuEvent) {
    if event.id().as_ref() == SETTINGS_MENU_ID {
        let _ = app.emit("open-settings", ());
    }
}

pub fn toggle_main_window(app: &AppHandle<crate::BrowserEngine>) {
    if let Some(window) = app.get_webview_window(crate::MAIN_WINDOW_LABEL) {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = window.hide();
        } else {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    } else {
        let _ = crate::show_or_create_main_window(app);
    }
}

pub fn global_shortcut_plugin() -> tauri::plugin::TauriPlugin<crate::BrowserEngine> {
    use tauri_plugin_global_shortcut::{Builder, ShortcutState};

    Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                toggle_main_window(app);
            }
        })
        .build()
}

pub fn register_global_shortcuts(app: &AppHandle<crate::BrowserEngine>) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    if let Err(error) = app.global_shortcut().register(TOGGLE_WINDOW_ACCELERATOR) {
        log::warn!("Failed to register global show/hide shortcut: {error}");
    }
}
