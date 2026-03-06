mod desktop_tray;
mod windows;

use std::sync::Arc;

#[cfg(debug_assertions)]
use specta_typescript::Typescript;
use tauri::Manager;
use tauri_specta::{collect_commands, Builder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = Builder::<tauri::Wry>::new().commands(collect_commands![
        desktop_tray::set_close_to_tray_enabled,
        windows::snap_overlay::show_snap_overlay,
        windows::snap_overlay::hide_snap_overlay,
        windows::window_tracking::start_window_tracking_with_target,
        windows::window_tracking::stop_window_tracking,
        windows::window_tracking::is_window_tracking_active,
    ]);

    #[cfg(debug_assertions)]
    specta_builder
        .export(
            Typescript::default().header("/* eslint-disable */"),
            "../src/app/generated/tauri.ts",
        )
        .unwrap_or_else(|e| eprintln!("Warning: Failed to export tauri-specta bindings: {e}"));

    let invoke_handler = specta_builder.invoke_handler();

    tauri::Builder::default()
        .manage(desktop_tray::DesktopSettingsState::new(true))
        .manage(Arc::new(windows::window_tracking::TrackingState::new()))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = desktop_tray::show_or_create_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            if let Some(window) = app.get_webview_window(desktop_tray::MAIN_WINDOW_LABEL) {
                desktop_tray::configure_main_window(&window);
            }

            desktop_tray::create_system_tray(app.handle())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(invoke_handler)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(desktop_tray::handle_run_event);
}
