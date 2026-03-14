use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::{MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

pub const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_MENU_SHOW_ID: &str = "tray_show";
const TRAY_MENU_QUIT_ID: &str = "tray_quit";

pub struct DesktopSettingsState {
    close_to_tray: AtomicBool,
}

impl DesktopSettingsState {
    pub fn new(close_to_tray: bool) -> Self {
        Self {
            close_to_tray: AtomicBool::new(close_to_tray),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayDoubleClickAction {
    Ignore,
    ShowOrCreateMainWindow,
    CloseMainWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExitRequestAction {
    AllowExit,
    CloseWindowsToTray,
}

fn tray_double_click_action(window_exists: bool, event: &TrayIconEvent) -> TrayDoubleClickAction {
    match event {
        TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => {
            if window_exists {
                TrayDoubleClickAction::CloseMainWindow
            } else {
                TrayDoubleClickAction::ShowOrCreateMainWindow
            }
        }
        _ => TrayDoubleClickAction::Ignore,
    }
}

fn exit_request_action(close_to_tray: bool, code: Option<i32>) -> ExitRequestAction {
    match (close_to_tray, code) {
        (_, Some(_)) => ExitRequestAction::AllowExit,
        (true, None) => ExitRequestAction::CloseWindowsToTray,
        (false, None) => ExitRequestAction::AllowExit,
    }
}

#[tauri::command]
pub fn set_close_to_tray_enabled(app: AppHandle<crate::BrowserEngine>, enabled: bool) {
    app.state::<DesktopSettingsState>()
        .close_to_tray
        .store(enabled, Ordering::Relaxed);
}

fn close_to_tray_enabled(app: &AppHandle<crate::BrowserEngine>) -> bool {
    app.state::<DesktopSettingsState>()
        .close_to_tray
        .load(Ordering::Relaxed)
}

fn main_window_exists(app: &AppHandle<crate::BrowserEngine>) -> bool {
    app.get_webview_window(MAIN_WINDOW_LABEL).is_some()
}

fn close_main_window(app: &AppHandle<crate::BrowserEngine>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.close();
    }
}

fn close_all_windows(app: &AppHandle<crate::BrowserEngine>) {
    for (_label, window) in app.webview_windows() {
        let _ = window.close();
    }
}

fn handle_exit_request(
    app: &AppHandle<crate::BrowserEngine>,
    code: Option<i32>,
    api: &tauri::ExitRequestApi,
) {
    if exit_request_action(close_to_tray_enabled(app), code)
        == ExitRequestAction::CloseWindowsToTray
    {
        api.prevent_exit();
        close_all_windows(app);
    }
}

fn handle_tray_double_click(app: &AppHandle<crate::BrowserEngine>, event: &TrayIconEvent) {
    match tray_double_click_action(main_window_exists(app), event) {
        TrayDoubleClickAction::ShowOrCreateMainWindow => {
            let _ = show_or_create_main_window(app);
        }
        TrayDoubleClickAction::CloseMainWindow => {
            close_main_window(app);
        }
        TrayDoubleClickAction::Ignore => {}
    }
}

pub fn configure_main_window(_window: &WebviewWindow<crate::BrowserEngine>) {
    #[cfg(target_os = "windows")]
    {
        let _ = _window.set_decorations(false);
    }
}

pub fn handle_run_event(app: &AppHandle<crate::BrowserEngine>, event: RunEvent) {
    if let RunEvent::ExitRequested { code, api, .. } = event {
        handle_exit_request(app, code, &api);
    }
}

pub fn show_or_create_main_window(app: &AppHandle<crate::BrowserEngine>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    if let Some(window_config) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .or_else(|| app.config().app.windows.first())
    {
        let window = WebviewWindowBuilder::from_config(app, window_config)?.build()?;
        configure_main_window(&window);
        return Ok(());
    }

    let window =
        WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::default()).build()?;
    configure_main_window(&window);

    Ok(())
}

pub fn create_system_tray(app: &AppHandle<crate::BrowserEngine>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_MENU_SHOW_ID, "Show", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT_ID, "Quit", true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event: MenuEvent| match event.id().as_ref() {
            TRAY_MENU_SHOW_ID => {
                let _ = show_or_create_main_window(app);
            }
            TRAY_MENU_QUIT_ID => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &TrayIcon<super::BrowserEngine>, event| {
            let app = tray.app_handle();
            handle_tray_double_click(app, &event);
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}
