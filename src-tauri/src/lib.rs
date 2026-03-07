mod windows;

#[cfg(desktop)]
mod desktop_tray;

#[cfg(debug_assertions)]
use specta_typescript::Typescript;

#[cfg(desktop)]
use tauri::Manager;

use sable_macros::collect_commands;
use tauri_specta::Builder;

#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = Builder::<tauri::Wry>::new().commands(collect_commands![
        #[cfg(desktop)]
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

    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS)
            .build(),
    );

    #[cfg(desktop)]
    let builder = builder.manage(desktop_tray::DesktopSettingsState::new(true));

    let builder = builder.manage(std::sync::Arc::new(
        windows::window_tracking::TrackingState::new(),
    ));

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        let _ = desktop_tray::show_or_create_main_window(app);
    }));

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
        .invoke_handler(invoke_handler)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(desktop)]
            desktop_tray::handle_run_event(app, event);

            #[cfg(not(desktop))]
            let _ = (app, event);
        });
}
