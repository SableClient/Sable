mod windows;

#[cfg(desktop)]
mod desktop_tray;

#[cfg(desktop)]
use tauri::Manager;

#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;

// Runtime selection: CEF or Wry
#[cfg(feature = "cef")]
use tauri::Cef as BrowserEngine;
#[cfg(all(not(feature = "cef"), feature = "wry"))]
use tauri::Wry as BrowserEngine;

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
    let builder = builder.manage(desktop_tray::DesktopSettingsState::new(true));

    #[cfg(windows)]
    let builder = builder.manage(std::sync::Arc::new(
        windows::window_tracking::TrackingState::new(),
    ));

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        let _ = desktop_tray::show_or_create_main_window(app);
    }));

    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_notifications::init());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_splashscreen::init())
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            #[cfg(desktop)]
            {
                if let Some(window) = app.get_webview_window(desktop_tray::MAIN_WINDOW_LABEL) {
                    desktop_tray::configure_main_window(&window);
                }
                desktop_tray::create_system_tray(app.handle())?;
            }

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
            desktop_tray::set_close_to_tray_enabled,
            #[cfg(windows)]
            windows::snap_overlay::show_snap_overlay,
            #[cfg(windows)]
            windows::snap_overlay::hide_snap_overlay,
            #[cfg(windows)]
            windows::window_tracking::start_window_tracking_with_target,
            #[cfg(windows)]
            windows::window_tracking::stop_window_tracking,
            #[cfg(windows)]
            windows::window_tracking::is_window_tracking_active,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(desktop)]
            desktop_tray::handle_run_event(app, event);

            #[cfg(not(desktop))]
            let _ = (app, event);
        });
}
