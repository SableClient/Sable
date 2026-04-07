use std::sync::atomic::{AtomicBool, Ordering};

use crate::desktop::runtime_state::DesktopRuntimeState;
use crate::desktop::settings::{
    desktop_settings_from_values, tray_available_for_session, DesktopSettings,
    CLOSE_TO_BACKGROUND_ON_CLOSE_KEY, DESKTOP_SETTINGS_PATH,
    LEGACY_KEEP_BACKGROUND_RUNNING_KEY, SHOW_SYSTEM_TRAY_ICON_KEY,
};
use serde_json::json;
use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent,
};
use tauri_plugin_store::StoreExt;

#[cfg(not(target_os = "linux"))]
use tauri::tray::{MouseButton, TrayIconEvent};

const MAIN_TRAY_ID: &str = "main";
const TRAY_MENU_SHOW_ID: &str = "tray_show";
const TRAY_MENU_QUIT_ID: &str = "tray_quit";

pub struct DesktopSettingsState {
    close_to_background_on_close: AtomicBool,
    show_system_tray_icon: AtomicBool,
    tray_available: AtomicBool,
}

impl Default for DesktopSettingsState {
    fn default() -> Self {
        Self {
            close_to_background_on_close: AtomicBool::new(true),
            show_system_tray_icon: AtomicBool::new(true),
            tray_available: AtomicBool::new(false),
        }
    }
}

#[cfg(not(target_os = "linux"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayDoubleClickAction {
    Ignore,
    ShowOrCreateMainWindow,
    CloseMainWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExitRequestAction {
    AllowExit,
    CloseWindowsToBackground,
}

#[cfg(not(target_os = "linux"))]
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

fn exit_request_action(settings: DesktopSettings, code: Option<i32>) -> ExitRequestAction {
    match (settings.close_to_background_on_close, code) {
        (_, Some(_)) => ExitRequestAction::AllowExit,
        (true, None) => ExitRequestAction::CloseWindowsToBackground,
        (false, None) => ExitRequestAction::AllowExit,
    }
}

fn load_desktop_settings(app: &AppHandle<crate::BrowserEngine>) -> tauri::Result<DesktopSettings> {
    let store = app
        .store_builder(DESKTOP_SETTINGS_PATH)
        .defaults(std::collections::HashMap::from([
            (CLOSE_TO_BACKGROUND_ON_CLOSE_KEY.into(), json!(true)),
            (SHOW_SYSTEM_TRAY_ICON_KEY.into(), json!(true)),
        ]))
        .build()
        .map_err(|error| tauri::Error::PluginInitialization("store".into(), error.to_string()))?;

    Ok(desktop_settings_from_values(
        store
            .get(CLOSE_TO_BACKGROUND_ON_CLOSE_KEY)
            .and_then(|value| value.as_bool()),
        store
            .get(SHOW_SYSTEM_TRAY_ICON_KEY)
            .and_then(|value| value.as_bool()),
        store
            .get(LEGACY_KEEP_BACKGROUND_RUNNING_KEY)
            .and_then(|value| value.as_bool()),
    ))
}

fn current_desktop_settings(app: &AppHandle<crate::BrowserEngine>) -> DesktopSettings {
    let state = app.state::<DesktopSettingsState>();
    DesktopSettings {
        close_to_background_on_close: state
            .close_to_background_on_close
            .load(Ordering::Relaxed),
        show_system_tray_icon: state.show_system_tray_icon.load(Ordering::Relaxed),
    }
}

fn desktop_runtime_state(app: &AppHandle<crate::BrowserEngine>) -> DesktopRuntimeState {
    DesktopRuntimeState {
        tray_available: app
            .state::<DesktopSettingsState>()
            .tray_available
            .load(Ordering::Relaxed),
    }
}

#[tauri::command]
pub fn get_desktop_runtime_state(app: AppHandle<crate::BrowserEngine>) -> DesktopRuntimeState {
    desktop_runtime_state(&app)
}

#[tauri::command]
pub fn sync_desktop_settings(
    app: AppHandle<crate::BrowserEngine>,
    settings: DesktopSettings,
) -> Result<DesktopRuntimeState, String> {
    apply_desktop_settings(&app, settings).map_err(|error| error.to_string())
}

pub(crate) fn sync_desktop_settings_inner(
    app: &AppHandle<crate::BrowserEngine>,
) -> tauri::Result<DesktopRuntimeState> {
    let settings = load_desktop_settings(app)?;
    apply_desktop_settings(app, settings)
}

fn apply_desktop_settings(
    app: &AppHandle<crate::BrowserEngine>,
    settings: DesktopSettings,
) -> tauri::Result<DesktopRuntimeState> {
    let state = app.state::<DesktopSettingsState>();

    state
        .close_to_background_on_close
        .store(settings.close_to_background_on_close, Ordering::Relaxed);
    state
        .show_system_tray_icon
        .store(settings.show_system_tray_icon, Ordering::Relaxed);

    if settings.show_system_tray_icon {
        if app.tray_by_id(MAIN_TRAY_ID).is_none() {
            match create_system_tray(app) {
                Ok(()) => state.tray_available.store(
                    tray_available_for_session(settings, true),
                    Ordering::Relaxed,
                ),
                Err(error) => {
                    log::warn!("Failed to initialize system tray: {error}");
                    state.tray_available.store(
                        tray_available_for_session(settings, false),
                        Ordering::Relaxed,
                    );
                }
            }
        } else {
            state.tray_available.store(
                tray_available_for_session(settings, true),
                Ordering::Relaxed,
            );
        }
    } else {
        let _ = app.remove_tray_by_id(MAIN_TRAY_ID);
        state.tray_available.store(false, Ordering::Relaxed);
    }

    Ok(desktop_runtime_state(app))
}

#[cfg(not(target_os = "linux"))]
fn main_window_exists(app: &AppHandle<crate::BrowserEngine>) -> bool {
    app.get_webview_window(crate::MAIN_WINDOW_LABEL).is_some()
}

#[cfg(not(target_os = "linux"))]
fn close_main_window(app: &AppHandle<crate::BrowserEngine>) {
    if let Some(window) = app.get_webview_window(crate::MAIN_WINDOW_LABEL) {
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
    let settings = current_desktop_settings(app);
    if exit_request_action(settings, code) == ExitRequestAction::CloseWindowsToBackground {
        api.prevent_exit();
        close_all_windows(app);
    }
}

#[cfg(not(target_os = "linux"))]
fn handle_tray_double_click(app: &AppHandle<crate::BrowserEngine>, event: &TrayIconEvent) {
    match tray_double_click_action(main_window_exists(app), event) {
        TrayDoubleClickAction::ShowOrCreateMainWindow => {
            let _ = crate::show_or_create_main_window(app);
        }
        TrayDoubleClickAction::CloseMainWindow => {
            close_main_window(app);
        }
        TrayDoubleClickAction::Ignore => {}
    }
}

pub fn handle_run_event(app: &AppHandle<crate::BrowserEngine>, event: RunEvent) {
    if let RunEvent::ExitRequested { code, api, .. } = event {
        handle_exit_request(app, code, &api);
    }
}

#[cfg(not(target_os = "linux"))]
fn configure_tray_icon_interactions(
    builder: TrayIconBuilder<crate::BrowserEngine>,
) -> TrayIconBuilder<crate::BrowserEngine> {
    builder
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            handle_tray_double_click(app, &event);
        })
}

#[cfg(target_os = "linux")]
fn configure_tray_icon_interactions(
    builder: TrayIconBuilder<crate::BrowserEngine>,
) -> TrayIconBuilder<crate::BrowserEngine> {
    builder
}

pub fn create_system_tray(app: &AppHandle<crate::BrowserEngine>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_MENU_SHOW_ID, "Show", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT_ID, "Quit", true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut tray_builder = configure_tray_icon_interactions(
        TrayIconBuilder::with_id(MAIN_TRAY_ID)
            .menu(&tray_menu)
            .on_menu_event(|app, event: MenuEvent| match event.id().as_ref() {
                TRAY_MENU_SHOW_ID => {
                    let _ = crate::show_or_create_main_window(app);
                }
                TRAY_MENU_QUIT_ID => {
                    app.exit(0);
                }
                _ => {}
            }),
    );

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}

#[cfg(test)]
fn tray_icon_events_supported() -> bool {
    !cfg!(target_os = "linux")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::settings::{desktop_settings_from_values, tray_available_for_session, DesktopSettings};

    #[test]
    fn close_behavior_keeps_sable_running() {
        let settings = DesktopSettings {
            close_to_background_on_close: true,
            show_system_tray_icon: false,
        };

        assert_eq!(
            exit_request_action(settings, None),
            ExitRequestAction::CloseWindowsToBackground
        );
    }

    #[test]
    fn tray_setting_does_not_keep_sable_running_on_its_own() {
        let settings = DesktopSettings {
            show_system_tray_icon: true,
            close_to_background_on_close: false,
        };

        assert_eq!(
            exit_request_action(settings, None),
            ExitRequestAction::AllowExit
        );
    }

    #[test]
    fn tray_failure_still_closes_to_background_when_requested() {
        let settings = DesktopSettings {
            close_to_background_on_close: true,
            show_system_tray_icon: true,
        };

        assert_eq!(
            exit_request_action(settings, None),
            ExitRequestAction::CloseWindowsToBackground
        );
        assert!(!tray_available_for_session(settings, false));
    }

    #[test]
    fn explicit_quit_bypasses_background_mode() {
        let settings = DesktopSettings {
            close_to_background_on_close: true,
            show_system_tray_icon: true,
        };

        assert_eq!(
            exit_request_action(settings, Some(0)),
            ExitRequestAction::AllowExit
        );
    }

    #[test]
    fn missing_store_values_default_to_enabled() {
        assert_eq!(
            desktop_settings_from_values(None, None, None),
            DesktopSettings {
                close_to_background_on_close: true,
                show_system_tray_icon: true,
            }
        );
    }

    #[test]
    fn legacy_background_store_value_migrates_to_close_behavior() {
        assert_eq!(
            desktop_settings_from_values(Some(false), Some(false), Some(true)),
            DesktopSettings {
                close_to_background_on_close: true,
                show_system_tray_icon: false,
            }
        );
    }

    #[test]
    fn explicit_store_values_are_preserved_when_legacy_background_is_off() {
        assert_eq!(
            desktop_settings_from_values(Some(false), Some(false), Some(false)),
            DesktopSettings {
                show_system_tray_icon: false,
                close_to_background_on_close: false,
            }
        );
    }

    #[test]
    fn tray_icon_event_support_matches_platform() {
        assert_eq!(tray_icon_events_supported(), !cfg!(target_os = "linux"));
    }
}
