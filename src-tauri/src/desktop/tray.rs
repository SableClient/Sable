use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use crate::desktop::runtime_state::DesktopRuntimeState;
use crate::desktop::settings::{
    desktop_settings_from_values, tray_available_for_session, use_custom_title_bar_default,
    DesktopSettings, CLOSE_TO_BACKGROUND_ON_CLOSE_KEY, DESKTOP_SETTINGS_PATH,
    LEGACY_KEEP_BACKGROUND_RUNNING_KEY, SHOW_SYSTEM_TRAY_ICON_KEY, SPELLCHECK_KEY,
    TOGGLE_WINDOW_SHORTCUT_KEY, USE_CUSTOM_TITLE_BAR_KEY,
};
use serde_json::json;
use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, WebviewWindow,
};
use tauri_plugin_store::StoreExt;

#[cfg(not(target_os = "linux"))]
use tauri::tray::{MouseButton, TrayIconEvent};

pub(crate) const MAIN_TRAY_ID: &str = "main";
pub(crate) const WINDOW_HIDDEN_TO_TRAY_EVENT: &str = "window-hidden-to-tray";
const TRAY_MENU_SHOW_ID: &str = "tray_show";
const TRAY_MENU_QUIT_ID: &str = "tray_quit";

pub struct DesktopSettingsState {
    close_to_background_on_close: AtomicBool,
    show_system_tray_icon: AtomicBool,
    use_custom_title_bar: AtomicBool,
    spellcheck: AtomicBool,
    tray_available: AtomicBool,
    /// Currently registered toggle-window global shortcut in web hotkey format,
    /// or `None` when the feature is disabled. Tracked so `desktop_runtime_state`
    /// can report it without re-reading the store.
    toggle_window_shortcut: Mutex<Option<String>>,
}

impl Default for DesktopSettingsState {
    fn default() -> Self {
        Self {
            close_to_background_on_close: AtomicBool::new(true),
            show_system_tray_icon: AtomicBool::new(true),
            use_custom_title_bar: AtomicBool::new(use_custom_title_bar_default()),
            spellcheck: AtomicBool::new(true),
            tray_available: AtomicBool::new(false),
            toggle_window_shortcut: Mutex::new(None),
        }
    }
}

impl DesktopSettingsState {
    pub(crate) fn toggle_window_shortcut(&self) -> Option<String> {
        self.toggle_window_shortcut.lock().unwrap().clone()
    }

    pub(crate) fn set_toggle_window_shortcut(&self, binding: Option<String>) {
        *self.toggle_window_shortcut.lock().unwrap() = binding;
    }
}

pub fn setup_close_to_background(webview_window: &WebviewWindow<crate::BrowserEngine>) {
    let window = webview_window.clone();
    webview_window.on_window_event(move |event| {
        let tauri::WindowEvent::CloseRequested { api, .. } = event else {
            return;
        };
        let state = window.state::<DesktopSettingsState>();
        if state.close_to_background_on_close.load(Ordering::Relaxed)
            && can_restore_from_background(DesktopRuntimeState {
                tray_available: state.tray_available.load(Ordering::Relaxed),
                toggle_window_shortcut: state.toggle_window_shortcut(),
            })
        {
            api.prevent_close();
            // Hiding does not reliably emit a native blur event, so notify the
            // webview before it can process new timeline events as read.
            let _ = window.emit(WINDOW_HIDDEN_TO_TRAY_EVENT, ());
            let _ = window.hide();
        }
    });
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExitRequestAction {
    AllowExit,
    CloseWindowsToBackground,
}

fn can_restore_from_background(runtime: DesktopRuntimeState) -> bool {
    cfg!(target_os = "macos") || runtime.tray_available
}

fn exit_request_action(
    settings: DesktopSettings,
    runtime: DesktopRuntimeState,
    code: Option<i32>,
) -> ExitRequestAction {
    if code.is_some()
        || !settings.close_to_background_on_close
        || !can_restore_from_background(runtime)
    {
        ExitRequestAction::AllowExit
    } else {
        ExitRequestAction::CloseWindowsToBackground
    }
}

pub(crate) fn load_desktop_settings(
    app: &AppHandle<crate::BrowserEngine>,
) -> tauri::Result<DesktopSettings> {
    let store = app
        .store_builder(DESKTOP_SETTINGS_PATH)
        .defaults(std::collections::HashMap::from([
            (CLOSE_TO_BACKGROUND_ON_CLOSE_KEY.into(), json!(true)),
            (SHOW_SYSTEM_TRAY_ICON_KEY.into(), json!(true)),
            (
                USE_CUSTOM_TITLE_BAR_KEY.into(),
                json!(use_custom_title_bar_default()),
            ),
            (SPELLCHECK_KEY.into(), json!(true)),
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
            .get(USE_CUSTOM_TITLE_BAR_KEY)
            .and_then(|value| value.as_bool()),
        store.get(SPELLCHECK_KEY).and_then(|value| value.as_bool()),
        store
            .get(LEGACY_KEEP_BACKGROUND_RUNNING_KEY)
            .and_then(|value| value.as_bool()),
    ))
}

fn current_desktop_settings(app: &AppHandle<crate::BrowserEngine>) -> DesktopSettings {
    let state = app.state::<DesktopSettingsState>();
    DesktopSettings {
        close_to_background_on_close: state.close_to_background_on_close.load(Ordering::Relaxed),
        show_system_tray_icon: state.show_system_tray_icon.load(Ordering::Relaxed),
        use_custom_title_bar: state.use_custom_title_bar.load(Ordering::Relaxed),
        spellcheck: state.spellcheck.load(Ordering::Relaxed),
    }
}

fn desktop_runtime_state(app: &AppHandle<crate::BrowserEngine>) -> DesktopRuntimeState {
    let state = app.state::<DesktopSettingsState>();
    DesktopRuntimeState {
        tray_available: state.tray_available.load(Ordering::Relaxed),
        toggle_window_shortcut: state.toggle_window_shortcut(),
    }
}

#[tauri::command]
pub fn get_desktop_runtime_state(app: AppHandle<crate::BrowserEngine>) -> DesktopRuntimeState {
    desktop_runtime_state(&app)
}

/// Set the global toggle-window shortcut. `binding` is in web hotkey format
/// (`"mod+shift+s"`); `None` disables the feature. Persists to the desktop
/// preferences store, registers (or unregisters) the OS accelerator, and
/// returns the refreshed runtime state.
#[tauri::command]
pub fn set_toggle_window_shortcut(
    app: AppHandle<crate::BrowserEngine>,
    binding: Option<String>,
) -> Result<DesktopRuntimeState, String> {
    let state = app.state::<DesktopSettingsState>();

    crate::desktop::menu::apply_toggle_window_shortcut(&app, binding.as_deref())?;

    // Persist after a successful (un)registration so the store never claims a
    // binding the OS rejected.
    app.store(DESKTOP_SETTINGS_PATH)
        .map_err(|error| error.to_string())?
        .set(TOGGLE_WINDOW_SHORTCUT_KEY, json!(binding));

    state.set_toggle_window_shortcut(binding);
    Ok(desktop_runtime_state(&app))
}

/// Called once at startup. Reads the persisted toggle-window shortcut from the
/// desktop preferences store and registers it if set. Nothing is registered
/// when the key is absent (the default — feature is off).
pub fn startup_register_toggle_window_shortcut(app: &AppHandle<crate::BrowserEngine>) {
    let state = app.state::<DesktopSettingsState>();

    let binding = app
        .store(DESKTOP_SETTINGS_PATH)
        .ok()
        .and_then(|store| store.get(TOGGLE_WINDOW_SHORTCUT_KEY))
        .and_then(|value| value.as_str().map(str::to_string));

    state.set_toggle_window_shortcut(binding.clone());

    if let Some(ref web) = binding {
        if let Err(error) = crate::desktop::menu::apply_toggle_window_shortcut(app, Some(web)) {
            log::warn!("Failed to register persisted toggle-window shortcut: {error}");
        }
    }
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
    state
        .use_custom_title_bar
        .store(settings.use_custom_title_bar, Ordering::Relaxed);
    state
        .spellcheck
        .store(settings.spellcheck, Ordering::Relaxed);

    apply_main_window_title_bar_settings(app, settings)?;

    if settings.show_system_tray_icon && cfg!(not(target_os = "macos")) {
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

fn apply_main_window_title_bar_settings(
    app: &AppHandle<crate::BrowserEngine>,
    settings: DesktopSettings,
) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(crate::MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    window.set_decorations(!settings.use_custom_title_bar)?;

    #[cfg(target_os = "macos")]
    window.set_title_bar_style(if settings.use_custom_title_bar {
        tauri::TitleBarStyle::Overlay
    } else {
        tauri::TitleBarStyle::Visible
    })?;

    Ok(())
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
    let runtime = desktop_runtime_state(app);
    if exit_request_action(settings, runtime, code) == ExitRequestAction::CloseWindowsToBackground {
        api.prevent_exit();
        close_all_windows(app);
    }
}

#[cfg(not(target_os = "linux"))]
fn handle_tray_double_click(app: &AppHandle<crate::BrowserEngine>, event: &TrayIconEvent) {
    if let TrayIconEvent::DoubleClick {
        button: MouseButton::Left,
        ..
    } = event
    {
        if let Some(window) = app.get_webview_window(crate::MAIN_WINDOW_LABEL) {
            if window.is_visible().unwrap_or(false) {
                let _ = window.close();
            } else {
                let _ = window.show();
                let _ = window.set_focus();
            }
        } else {
            let _ = crate::show_or_create_main_window(app);
        }
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

// libappindicator panics (rather than returning an error) when the appindicator
// library is missing, which would crash the whole app. Probe for it first and
// treat its absence as a recoverable tray failure.
#[cfg(target_os = "linux")]
fn appindicator_available() -> bool {
    const CANDIDATES: [&str; 4] = [
        "libayatana-appindicator3.so.1",
        "libappindicator3.so.1",
        "libayatana-appindicator3.so",
        "libappindicator3.so",
    ];
    CANDIDATES
        .iter()
        .any(|name| unsafe { libloading::Library::new(*name) }.is_ok())
}

// The AppImage bundles libayatana-appindicator, so the library probe passes on
// every desktop. Without a StatusNotifierItem host the icon is created and never
// rendered, which strands the window with no way to restore it.
#[cfg(target_os = "linux")]
fn status_notifier_host_available() -> bool {
    const WATCHER: &str = "org.kde.StatusNotifierWatcher";
    let Ok(name) = zbus::names::BusName::try_from(WATCHER) else {
        return false;
    };
    let Ok(connection) = zbus::blocking::Connection::session() else {
        return false;
    };
    let Ok(dbus) = zbus::blocking::fdo::DBusProxy::new(&connection) else {
        return false;
    };
    dbus.name_has_owner(name).unwrap_or(false)
}

pub fn create_system_tray(app: &AppHandle<crate::BrowserEngine>) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    if !appindicator_available() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "appindicator library not found; skipping system tray",
        )
        .into());
    }

    #[cfg(target_os = "linux")]
    if !status_notifier_host_available() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "no StatusNotifierWatcher on the session bus; skipping system tray",
        )
        .into());
    }

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

    #[cfg(target_os = "linux")]
    crate::desktop::tray_badge::reset_badge_state();

    Ok(())
}

#[cfg(test)]
fn tray_icon_events_supported() -> bool {
    !cfg!(target_os = "linux")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::settings::{
        desktop_settings_from_values, tray_available_for_session, DesktopSettings,
    };

    fn tray_up() -> DesktopRuntimeState {
        DesktopRuntimeState {
            tray_available: true,
            toggle_window_shortcut: None,
        }
    }
    fn no_tray() -> DesktopRuntimeState {
        DesktopRuntimeState {
            tray_available: false,
            toggle_window_shortcut: None,
        }
    }

    #[test]
    fn close_behavior_keeps_sable_running() {
        let settings = DesktopSettings {
            close_to_background_on_close: true,
            show_system_tray_icon: true,
            use_custom_title_bar: false,
            spellcheck: true,
        };

        assert_eq!(
            exit_request_action(settings, tray_up(), None),
            ExitRequestAction::CloseWindowsToBackground
        );
    }

    #[test]
    fn tray_setting_does_not_keep_sable_running_on_its_own() {
        let settings = DesktopSettings {
            show_system_tray_icon: true,
            close_to_background_on_close: false,
            use_custom_title_bar: false,
            spellcheck: true,
        };

        assert_eq!(
            exit_request_action(settings, tray_up(), None),
            ExitRequestAction::AllowExit
        );
    }

    #[test]
    fn tray_failure_allows_exit_instead_of_stranding_the_process() {
        let settings = DesktopSettings {
            close_to_background_on_close: true,
            show_system_tray_icon: true,
            use_custom_title_bar: false,
            spellcheck: true,
        };

        assert!(!tray_available_for_session(settings, false));
        assert_eq!(
            exit_request_action(settings, no_tray(), None),
            if cfg!(target_os = "macos") {
                ExitRequestAction::CloseWindowsToBackground
            } else {
                ExitRequestAction::AllowExit
            }
        );
    }

    #[test]
    fn macos_closes_to_background_without_a_tray() {
        assert_eq!(
            can_restore_from_background(no_tray()),
            cfg!(target_os = "macos")
        );
        assert!(can_restore_from_background(tray_up()));
    }

    #[test]
    fn explicit_quit_bypasses_background_mode() {
        let settings = DesktopSettings {
            close_to_background_on_close: true,
            show_system_tray_icon: true,
            use_custom_title_bar: false,
            spellcheck: true,
        };

        assert_eq!(
            exit_request_action(settings, tray_up(), Some(0)),
            ExitRequestAction::AllowExit
        );
    }

    #[test]
    fn missing_store_values_default_to_enabled() {
        assert_eq!(
            desktop_settings_from_values(None, None, None, None, None),
            DesktopSettings {
                close_to_background_on_close: true,
                show_system_tray_icon: true,
                use_custom_title_bar: use_custom_title_bar_default(),
                spellcheck: true,
            }
        );
    }

    #[test]
    fn legacy_background_store_value_migrates_to_close_behavior() {
        assert_eq!(
            desktop_settings_from_values(Some(false), Some(false), Some(false), None, Some(true)),
            DesktopSettings {
                close_to_background_on_close: true,
                show_system_tray_icon: false,
                use_custom_title_bar: false,
                spellcheck: true,
            }
        );
    }

    #[test]
    fn explicit_store_values_are_preserved_when_legacy_background_is_off() {
        assert_eq!(
            desktop_settings_from_values(Some(false), Some(false), Some(true), None, Some(false)),
            DesktopSettings {
                show_system_tray_icon: false,
                close_to_background_on_close: false,
                use_custom_title_bar: true,
                spellcheck: true,
            }
        );
    }

    #[test]
    fn tray_icon_event_support_matches_platform() {
        assert_eq!(tray_icon_events_supported(), !cfg!(target_os = "linux"));
    }
}
