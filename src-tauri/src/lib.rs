#[cfg(all(feature = "cef", target_os = "linux"))]
pub mod deep_link_ipc;
#[cfg(desktop)]
mod desktop;
mod diagnostics;
#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "android")]
mod mobile;
#[cfg(any(target_os = "android", target_os = "ios"))]
mod mobile_diagnostics;
mod network;
mod sentry;
mod share_inbox;

use tauri::{AppHandle, Manager};
#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;

// CEF (Chromium) on Linux; wry everywhere else.
#[cfg(all(feature = "cef", target_os = "linux"))]
type BrowserEngine = tauri_runtime_cef::CefRuntime<tauri::EventLoopMessage>;
#[cfg(any(
    all(not(feature = "cef"), feature = "wry"),
    all(feature = "cef", not(target_os = "linux"))
))]
use tauri::Wry as BrowserEngine;

pub const MAIN_WINDOW_LABEL: &str = "main";

#[cfg(desktop)]
pub(crate) fn main_window_title(app: &AppHandle<crate::BrowserEngine>) -> &str {
    app.config().product_name.as_deref().unwrap_or("Sable")
}

#[cfg(all(
    not(feature = "cef"),
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "openbsd",
        target_os = "netbsd"
    )
))]
fn prompt_webview_permission(message: &str) -> bool {
    use gtk::prelude::*;
    use gtk::{ButtonsType, DialogFlags, MessageDialog, MessageType, ResponseType};

    let dialog = MessageDialog::new(
        None::<&gtk::Window>,
        DialogFlags::MODAL,
        MessageType::Question,
        ButtonsType::YesNo,
        message,
    );
    dialog.set_title("Permission request");
    let response = dialog.run();
    dialog.close();
    matches!(response, ResponseType::Yes)
}

// Return the remembered decision for a webview permission, or prompt the user
// once and persist their choice for next time.
#[cfg(all(
    not(feature = "cef"),
    any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "openbsd",
        target_os = "netbsd"
    )
))]
fn resolve_webview_permission(
    app: &AppHandle<crate::BrowserEngine>,
    key: &str,
    message: &str,
) -> bool {
    use tauri_plugin_store::StoreExt;

    let store = app.store("permissions.json").ok();
    if let Some(allowed) = store
        .as_ref()
        .and_then(|store| store.get(key))
        .and_then(|value| value.as_bool())
    {
        return allowed;
    }

    let allowed = prompt_webview_permission(message);

    if let Some(store) = &store {
        store.set(key, allowed);
        let _ = store.save();
    }

    allowed
}

#[cfg(all(feature = "cef", target_os = "linux"))]
fn setup_cef_resize_workaround(
    webview_window: &tauri::WebviewWindow<BrowserEngine>,
) -> tauri::Result<()> {
    let webview = webview_window.as_ref().clone();
    webview.set_auto_resize(false)?;
    webview_window.on_window_event(move |event| {
        let size = match event {
            tauri::WindowEvent::Resized(size) => *size,
            tauri::WindowEvent::ScaleFactorChanged { new_inner_size, .. } => *new_inner_size,
            _ => return,
        };

        if let Err(error) = webview.set_bounds(tauri::Rect {
            position: tauri::Position::Physical(tauri::PhysicalPosition::new(0, 0)),
            size: tauri::Size::Physical(size),
        }) {
            log::warn!("failed to resize CEF webview: {error}");
        }
    });
    Ok(())
}

/// Routes in-app notification sounds to the native volume stream on mobile.
/// `kind` is "notification" or "invite".
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
fn play_notification_sound(kind: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        mobile::play_notification_sound(kind)
    }
    #[cfg(target_os = "ios")]
    {
        ios::play_notification_sound(kind)
    }
}

pub fn show_or_create_main_window(app: &AppHandle<crate::BrowserEngine>) -> tauri::Result<()> {
    if let Some(_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        #[cfg(desktop)]
        {
            _window.unminimize()?;
            _window.show()?;
            _window.set_focus()?;
        }

        return Ok(());
    }

    log::info!("Main window not found, creating a new one.");

    #[cfg(desktop)]
    let desktop_settings = desktop::tray::load_desktop_settings(app)?;

    let builder =
        tauri::WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, tauri::WebviewUrl::default())
            .disable_drag_drop_handler()
            .use_https_scheme(true)
            .background_color(tauri::window::Color(0x1A, 0x1C, 0x28, 0xFF));

    // Only android: intercept navigation to external URLs and open them in the system browser
    // Other platforms: might need other URI schemes, and on_navigation might get called on iframe urls
    // (as of now, the following is confirmed not to work with linux/webkit2gtk)
    #[cfg(target_os = "android")]
    let builder = {
        let nav_handle = app.clone();
        builder.on_navigation(move |url| {
            let internal = url.scheme() == "tauri"
                || url.host_str() == Some("tauri.localhost")
                || (cfg!(dev) && url.host_str() == Some("localhost"));
            if !internal {
                // open in new thread
                // open_url blocks on the ui thread but we are on the ui thread...
                let handle = nav_handle.clone();
                let url = url.to_string();
                std::thread::spawn(move || {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = handle.opener().open_url(url, None::<&str>);
                });
            }
            internal
        })
    };

    #[cfg(desktop)]
    let title = main_window_title(app);

    #[cfg(desktop)]
    let builder = builder
        .title(title)
        .resizable(true)
        .fullscreen(false)
        .inner_size(1280.0, 720.0)
        .visible(false);

    #[cfg(target_os = "macos")]
    let builder =
        builder
            .hidden_title(true)
            .title_bar_style(if desktop_settings.use_custom_title_bar {
                tauri::TitleBarStyle::Overlay
            } else {
                tauri::TitleBarStyle::Visible
            });

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let builder = builder.decorations(!desktop_settings.use_custom_title_bar);

    #[cfg(desktop)]
    let webview_window = builder.build()?;
    #[cfg(not(desktop))]
    builder.build()?;

    #[cfg(all(feature = "cef", target_os = "linux"))]
    setup_cef_resize_workaround(&webview_window)?;

    #[cfg(desktop)]
    desktop::tray::setup_close_to_background(&webview_window);

    // WebKitGTK only (wry). Under CEF, permissions go through set_permission_policy.
    #[cfg(all(
        not(feature = "cef"),
        any(
            target_os = "linux",
            target_os = "dragonfly",
            target_os = "freebsd",
            target_os = "openbsd",
            target_os = "netbsd"
        )
    ))]
    {
        use tauri::Manager;
        use webkit2gtk::glib::prelude::Cast;
        use webkit2gtk::{
            GeolocationPermissionRequest, NotificationPermissionRequest, PermissionRequestExt,
            SettingsExt, UserMediaPermissionRequest, WebViewExt,
        };
        let app_handle = app.clone();
        if let Some(wv) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = wv.with_webview(move |webview| {
                let gtk_webview = webview.inner();
                if let Some(settings) = gtk_webview.settings() {
                    settings.set_enable_webrtc(true);
                    settings.set_enable_media_stream(true);
                    settings.set_enable_mediasource(true);
                    settings.set_enable_media(true);
                    // Enable inspector via SABLE_DEVTOOLS env var.
                    if std::env::var("SABLE_DEVTOOLS").is_ok() {
                        settings.set_enable_developer_extras(true);
                    }
                }

                // Bypass CORS for HTTP(S) targets so Element Call's iframe
                // fetches to split-horizon DNS homeservers aren't PNA-blocked.
                // Same-origin policy and CSP remain enforced.
                gtk_webview.set_cors_allowlist(&["http://*/*", "https://*/*"]);

                gtk_webview.connect_permission_request(move |_wv, request| {
                    // Ask the user (once per permission type, then remember the choice)
                    // for the permissions Sable actually uses; deny anything else.
                    let decision = if request
                        .downcast_ref::<UserMediaPermissionRequest>()
                        .is_some()
                    {
                        Some(("media", "Allow Sable to use your camera and microphone?"))
                    } else if request
                        .downcast_ref::<NotificationPermissionRequest>()
                        .is_some()
                    {
                        Some((
                            "notifications",
                            "Allow Sable to show desktop notifications?",
                        ))
                    } else if request
                        .downcast_ref::<GeolocationPermissionRequest>()
                        .is_some()
                    {
                        Some(("geolocation", "Allow Sable to access your location?"))
                    } else {
                        None
                    };

                    match decision {
                        Some((key, message))
                            if resolve_webview_permission(&app_handle, key, message) =>
                        {
                            request.allow();
                        }
                        _ => request.deny(),
                    }
                    true
                });
            });
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _sentry_guard = sentry::init();

    let builder = tauri::Builder::<BrowserEngine>::new();

    // macOS needs a standard menu (with the Edit submenu) for keyboard
    // copy/paste/select-all to work in the webview. It lives in the system menu
    // bar, so it is macOS-only to avoid an in-window menu bar elsewhere.
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(|handle| desktop::menu::build_app_menu(handle))
        .on_menu_event(|app, event| desktop::menu::handle_menu_event(app, &event));

    #[cfg(desktop)]
    let builder = builder.plugin(desktop::menu::global_shortcut_plugin());

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

    let builder = builder.plugin(tauri_plugin_notifications::init());

    #[cfg(all(desktop, feature = "updater"))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(target_os = "ios")]
    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(mobile)]
    let builder = builder
        .plugin(tauri_plugin_edge_to_edge::init())
        .plugin(tauri_plugin_livekit_mobile::init())
        .plugin(tauri_plugin_sharekit::init());

    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_android_fs::init());

    let app = builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .manage(network::media_protocol::MediaSessionState::default())
        .register_asynchronous_uri_scheme_protocol(
            network::media_protocol::MEDIA_URI_SCHEME,
            network::media_protocol::respond,
        )
        .setup(|app| {
            // CEF is initialized during runtime construction; initialize GTK afterward
            // on the main thread for the Linux tray menu.
            #[cfg(all(feature = "cef", target_os = "linux"))]
            gtk::init()?;

            network::native_upload::cleanup_uploads(app.handle());

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            #[cfg(all(feature = "cef", target_os = "linux"))]
            deep_link_ipc::drain_pending_urls(app.handle());

            show_or_create_main_window(app.handle())?;

            // Failsafe: if the frontend never calls show() (hung webview), force-show
            // the window after 5s so the app isn't invisible forever.
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    if let Some(window) = handle.get_webview_window(MAIN_WINDOW_LABEL) {
                        if !window.is_visible().unwrap_or(true) {
                            let _ = window.show();
                            let _ = window.set_focus();
                            log::warn!(
                                "Frontend show() not received within 5s — force-showing window"
                            );
                        }
                    }
                });
            }

            #[cfg(target_os = "ios")]
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                ios::hide_form_accessory_bar(&window);
                ios::enable_swipe_back_navigation(&window);
            }

            #[cfg(desktop)]
            desktop::tray::sync_desktop_settings_inner(app.handle())?;

            #[cfg(desktop)]
            desktop::menu::register_global_shortcuts(app.handle());

            #[cfg(desktop)]
            desktop::logging::setup(app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            network::loopback_http::abort_loopback_fetch,
            network::loopback_http::loopback_fetch,
            network::native_upload::native_upload,
            network::native_upload::upload_write_chunk,
            network::native_upload::abort_native_upload,
            network::media_protocol::set_media_session,
            network::media_protocol::clear_media_session,
            network::media_protocol::set_media_encryption,
            sentry::set_native_sentry_enabled,
            share_inbox::share_inbox_drain,
            share_inbox::share_inbox_read,
            share_inbox::share_inbox_clear,
            #[cfg(target_os = "android")]
            mobile::set_status_bar_color,
            #[cfg(target_os = "android")]
            mobile::set_navigation_bar_color,
            #[cfg(target_os = "android")]
            mobile::start_call_foreground_service,
            #[cfg(target_os = "android")]
            mobile::stop_call_foreground_service,
            #[cfg(target_os = "ios")]
            ios::haptic_feedback,
            #[cfg(target_os = "ios")]
            ios::save_media_to_photos,
            #[cfg(any(target_os = "android", target_os = "ios"))]
            play_notification_sound,
            #[cfg(target_os = "ios")]
            ios::activate_call_audio_session,
            #[cfg(target_os = "ios")]
            ios::deactivate_call_audio_session,
            #[cfg(desktop)]
            desktop::download::save_download,
            #[cfg(desktop)]
            desktop::diagnostics::export_diagnostics,
            #[cfg(any(target_os = "android", target_os = "ios"))]
            mobile_diagnostics::build_diagnostics_archive,
            #[cfg(desktop)]
            desktop::tray::get_desktop_runtime_state,
            #[cfg(desktop)]
            desktop::tray::sync_desktop_settings,
            #[cfg(target_os = "linux")]
            desktop::tray_badge::set_tray_badge,
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
        .build(tauri::generate_context!());

    let Ok(app) = app else {
        // On Android this function is called through JNI. Panicking here causes
        // "panic_cannot_unwind" and aborts the whole process without a useful
        // message in logcat.
        eprintln!("failed to build tauri application: {app:?}");
        return;
    };

    app.run(|app, event| {
        #[cfg(desktop)]
        desktop::tray::handle_run_event(app, event);

        #[cfg(not(any(desktop, mobile)))]
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
            use_custom_title_bar: false,
        };
        let _ = crate::desktop::runtime_state::DesktopRuntimeState {
            tray_available: true,
        };
    }
}
