#[cfg(desktop)]
mod desktop;

use tauri::{AppHandle, Manager};
#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;

// Runtime selection: CEF or Wry
#[cfg(feature = "cef")]
use tauri::Cef as BrowserEngine;
#[cfg(all(not(feature = "cef"), feature = "wry"))]
use tauri::Wry as BrowserEngine;

pub const MAIN_WINDOW_LABEL: &str = "main";

pub fn show_or_create_main_window(app: &AppHandle<crate::BrowserEngine>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        #[cfg(desktop)]
        {
            window.unminimize()?;
            window.show()?;
            window.set_focus()?;
        }

        return Ok(());
    }

    log::info!("Main window not found, creating a new one.");

    let builder =
        tauri::WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, tauri::WebviewUrl::default());

    #[cfg(desktop)]
    let builder = builder
        .title(app.package_info().name.clone())
        .resizable(true)
        .fullscreen(false)
        .inner_size(1280.0, 720.0)
        .visible(false);

    #[cfg(target_os = "windows")]
    let builder = builder.decorations(false);

    builder.build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::<BrowserEngine>::new();

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS)
            .build(),
    );

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(desktop::tray::DesktopSettingsState::default());

    #[cfg(windows)]
    let builder = builder.manage(std::sync::Arc::new(
        desktop::windows::window_tracking::TrackingState::new(),
    ));

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        let _ = show_or_create_main_window(app);
    }));

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_notifications::init());

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_edge_to_edge::init());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            show_or_create_main_window(app.handle())?;

            #[cfg(desktop)]
            desktop::tray::sync_desktop_settings_inner(app.handle())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            #[cfg(desktop)]
            desktop::tray::get_desktop_runtime_state,
            #[cfg(desktop)]
            desktop::tray::sync_desktop_settings,
            #[cfg(windows)]
            desktop::windows::snap_overlay::show_snap_overlay,
            #[cfg(windows)]
            desktop::windows::snap_overlay::hide_snap_overlay,
            #[cfg(windows)]
            desktop::windows::window_tracking::start_window_tracking_with_target,
            #[cfg(windows)]
            desktop::windows::window_tracking::stop_window_tracking,
            #[cfg(windows)]
            desktop::windows::window_tracking::is_window_tracking_active,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(desktop)]
            desktop::tray::handle_run_event(app, event);

            #[cfg(not(desktop))]
            let _ = (app, event);
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn desktop_modules_are_grouped_under_desktop() {
        let _ = crate::desktop::settings::DesktopSettings {
            close_to_background_on_close: true,
            show_system_tray_icon: true,
        };
        let _ = crate::desktop::runtime_state::DesktopRuntimeState {
            tray_available: true,
        };
    }
}
