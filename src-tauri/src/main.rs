// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(all(feature = "cef", target_os = "linux"))]
fn prompt_cef_permission(message: String, tx: std::sync::mpsc::Sender<bool>) {
    use gtk::glib;
    use gtk::prelude::*;
    use gtk::{ButtonsType, DialogFlags, MessageDialog, MessageType, ResponseType, WindowPosition};

    // Non-blocking: show() + response signal instead of run().
    // dialog.run() blocks the GLib main loop, which CEF's message pump
    // also uses on Linux, freezing the app.
    glib::idle_add_once(move || {
        let dialog = MessageDialog::new(
            None::<&gtk::Window>,
            DialogFlags::MODAL,
            MessageType::Question,
            ButtonsType::YesNo,
            &message,
        );
        dialog.set_title("Permission request");
        dialog.set_position(WindowPosition::CenterAlways);

        let tx = std::cell::RefCell::new(Some(tx));
        dialog.connect_response(move |dlg, response| {
            if let Some(tx) = tx.take() {
                let _ = tx.send(matches!(response, ResponseType::Yes));
            }
            dlg.close();
        });

        dialog.show();
    });
}

fn main() {
    // CEF (Chromium) runtime, Linux only. Must run before anything else — CEF
    // re-execs this binary for its subprocesses.
    #[cfg(all(feature = "cef", target_os = "linux"))]
    {
        tauri_runtime_cef::configure(tauri_runtime_cef::CefConfig {
            identifier: "moe.sable.client".into(),
            custom_schemes: vec![
                "tauri".into(),
                "ipc".into(),
                "asset".into(),
                "sable-media".into(),
            ],
            deep_link_schemes: vec!["moe.sable.app".into(), "sable".into()],
            command_line_args: {
                let mut args = vec![
                    ("--disable-gpu-sandbox".into(), None),
                    ("--disable-font-subpixel-positioning".into(), None),
                    ("--enable-font-antialiasing".into(), None),
                    (
                        "autoplay-policy".into(),
                        Some("no-user-gesture-required".into()),
                    ),
                    (
                        "enable-features".into(),
                        Some("SharedArrayBuffer".into()),
                    ),
                    ("--disable-background-timer-throttling".into(), None),
                    ("--skia-resource-cache-limit-mb".into(), Some("64".into())),
                    ("--renderer-process-limit".into(), Some("2".into())),
                    (
                        "disable-features".into(),
                        Some("SpareRendererForSitePerProcess,IntensiveWakeUpThrottling,AutofillActorMode,GlicActorUi,LensOverlay,LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSocket,LocalNetworkAccessChecksWebRTC".into()),
                    ),
                ];

                // Remote debugging via SABLE_DEVTOOLS=port env var.
                // Open chrome://inspect in Chrome to connect.
                if let Ok(port) = std::env::var("SABLE_DEVTOOLS") {
                    args.push(("--remote-debugging-port".into(), Some(port)));
                }

                // Diagnostic escape hatch for GPU/display-resume crashes. Keep
                // acceleration enabled by default; this is for affected users to
                // A/B test without rebuilding the application.
                if std::env::var_os("SABLE_DISABLE_GPU").is_some() {
                    args.push(("--disable-gpu".into(), None));
                }

                // Extra Chromium switches, comma-separated `key=value` or bare `key`:
                //   SABLE_CEF_ARGS="disable-gpu-compositing,use-angle=vulkan"
                if let Ok(extra) = std::env::var("SABLE_CEF_ARGS") {
                    for arg in extra.split(',').map(str::trim).filter(|a| !a.is_empty()) {
                        match arg.split_once('=') {
                            Some((key, value)) => {
                                args.push((key.to_owned(), Some(value.to_owned())))
                            }
                            None => args.push((arg.to_owned(), None)),
                        }
                    }
                }
                args
            },
            ..Default::default()
        });

        // Subprocess — hand off to CEF and exit.
        if std::env::args().any(|arg| arg.starts_with("--type=")) {
            tauri_runtime_cef::run_cef_helper_process();
            return;
        }

        // Deep-link relaunch: forward to the running primary and exit before
        // CEF init (a second instance can't hold the CEF cache lock).
        if let app_lib::deep_link_ipc::ForwardResult::Forwarded =
            app_lib::deep_link_ipc::try_forward_deep_links()
        {
            return;
        }

        // Allow call media capture (mic, camera, screen-share) and geolocation for our webview.
        // Cache granted permissions so we only prompt once per kind.
        use std::collections::HashSet;
        use std::sync::{Mutex, OnceLock};
        static GRANTED: OnceLock<Mutex<HashSet<&'static str>>> = OnceLock::new();
        let granted = GRANTED.get_or_init(|| Mutex::new(HashSet::new()));

        tauri_runtime_cef::set_permission_policy(move |request, responder| {
            use tauri_runtime_cef::{DenyReason, PermissionKind};

            if request.webview_label != "main"
                || !request
                    .origin
                    .as_ref()
                    .is_some_and(|origin| origin.is_app_local())
            {
                return responder.deny(DenyReason::NoPolicy);
            }

            let permission_kinds: Vec<PermissionKind> = request
                .kinds
                .iter()
                .filter(|kind| {
                    matches!(
                        kind,
                        PermissionKind::Microphone
                            | PermissionKind::Camera
                            | PermissionKind::CameraPanTiltZoom
                            | PermissionKind::ScreenCapture
                            | PermissionKind::CapturedSurfaceControl
                            | PermissionKind::Geolocation
                    )
                })
                .cloned()
                .collect();

            if permission_kinds.is_empty() || permission_kinds.len() != request.kinds.len() {
                return responder.deny(DenyReason::NoPolicy);
            }

            // Check cache: if all requested kinds were already granted, allow immediately.
            let kind_names: Vec<&'static str> = permission_kinds
                .iter()
                .map(|k| match k {
                    PermissionKind::Microphone => "mic",
                    PermissionKind::Camera | PermissionKind::CameraPanTiltZoom => "cam",
                    PermissionKind::ScreenCapture | PermissionKind::CapturedSurfaceControl => {
                        "screen"
                    }
                    PermissionKind::Geolocation => "geolocation",
                    _ => "other",
                })
                .collect();

            {
                let cache = granted.lock().unwrap();
                if kind_names.iter().all(|k| cache.contains(k)) {
                    return responder.allow();
                }
            }

            let msg = match permission_kinds.as_slice() {
                [PermissionKind::Microphone] => "Sable wants to access your microphone.",
                [PermissionKind::Camera] => "Sable wants to access your camera.",
                [PermissionKind::ScreenCapture] | [PermissionKind::CapturedSurfaceControl] => {
                    "Sable wants to share your screen."
                }
                [PermissionKind::Geolocation] => "Sable wants to access your location.",
                _ if permission_kinds.contains(&PermissionKind::Microphone)
                    && permission_kinds.contains(&PermissionKind::Camera) =>
                {
                    "Sable wants to access your microphone and camera."
                }
                _ => "Sable wants to access media devices.",
            };

            // Defer the CEF callback and ask the user via a native GTK dialog.
            // The policy runs on a CEF thread and must not block; defer() hands
            // the answer to a worker thread that waits on the dialog result.
            let deferred = responder.defer(tauri_runtime_cef::DEFAULT_PROMPT_TIMEOUT);
            let (tx, rx) = std::sync::mpsc::channel();
            let kinds_to_cache = kind_names.clone();
            prompt_cef_permission(msg.to_string(), tx);
            std::thread::spawn(move || {
                let allowed = rx
                    .recv_timeout(tauri_runtime_cef::DEFAULT_PROMPT_TIMEOUT)
                    .unwrap_or(false);
                if allowed {
                    let mut cache = granted.lock().unwrap();
                    for k in &kinds_to_cache {
                        cache.insert(k);
                    }
                    deferred.allow();
                } else {
                    deferred.deny(DenyReason::PolicyDenied);
                }
            });
        });
    }

    // Force X11/XWayland: the tray's GTK needs it, and the CEF runtime's Wayland
    // window path is unstable (crate verified on X11 only).
    #[cfg(target_os = "linux")]
    unsafe {
        // https://github.com/tauri-apps/tao/issues/1046
        // https://github.com/tauri-apps/tauri/issues/11856
        // https://github.com/tauri-apps/tauri/issues/14251
        std::env::set_var("GDK_BACKEND", "x11");

        // NVIDIA explicit sync is another upstream WebKitGTK/Wayland failure mode. Prefer this lower-cost workaround over WEBKIT_DISABLE_DMABUF_RENDERER=1, but don't stomp an explicit user override.
        // https://github.com/tauri-apps/tauri/issues/10702
        // https://github.com/tauri-apps/tauri/issues/9394
        if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
    }

    // WebKitGTK/GStreamer workarounds, wry only; inert under CEF (Chromium).
    #[cfg(all(not(feature = "cef"), target_os = "linux"))]
    unsafe {
        use std::path::{Path, PathBuf};

        // The library comes from build.rs's rpath, but the helper processes are
        // resolved from a compile-time /usr/lib path. Inert without a bundle.
        if let Some(runtime) = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("webkit")))
            .filter(|dir| dir.join("WebKitWebProcess").exists())
        {
            if std::env::var_os("WEBKIT_EXEC_PATH").is_none() {
                std::env::set_var("WEBKIT_EXEC_PATH", &runtime);
            }
            if std::env::var_os("WEBKIT_INJECTED_BUNDLE_PATH").is_none() {
                std::env::set_var(
                    "WEBKIT_INJECTED_BUNDLE_PATH",
                    runtime.join("injected-bundle"),
                );
            }

            // Both paths, or the host-probing block below fills the one left
            // unset and its plugins load against our older GStreamer core.
            let gst = runtime.join("gstreamer-1.0");
            if gst.is_dir() {
                for key in ["GST_PLUGIN_SYSTEM_PATH_1_0", "GST_PLUGIN_PATH_1_0"] {
                    if std::env::var_os(key).is_none() {
                        std::env::set_var(key, &gst);
                    }
                }
                if std::env::var_os("GST_PLUGIN_SCANNER").is_none() {
                    std::env::set_var("GST_PLUGIN_SCANNER", gst.join("gst-plugin-scanner"));
                }
                if std::env::var_os("GST_REGISTRY_1_0").is_none() {
                    std::env::set_var("GST_REGISTRY_1_0", runtime.join("gst-registry.bin"));
                }
            }
        }

        // WebKit2GTK can hit compositor/DMABUF bugs
        // https://github.com/tauri-apps/tauri/issues/14424
        // https://github.com/tauri-apps/tauri/issues/9394
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        // AppImage can fail to discover host GStreamer plugins/scanner. Probe
        // common distro layouts, but don't override explicit user config.
        // Not finding these plugings prevents Sable from launching correctly.
        // Maybe there's a better way to do this?
        let plugin_dirs = [
            "/usr/lib/gstreamer-1.0",
            "/usr/lib64/gstreamer-1.0",
            "/usr/local/lib/gstreamer-1.0",
            "/usr/local/lib64/gstreamer-1.0",
            "/usr/lib/x86_64-linux-gnu/gstreamer-1.0",
            "/usr/lib/aarch64-linux-gnu/gstreamer-1.0",
            "/run/host/usr/lib/gstreamer-1.0",
            "/run/host/usr/lib64/gstreamer-1.0",
        ];
        let resolved_plugin_dir = plugin_dirs.iter().find(|dir| Path::new(dir).exists());

        if std::env::var_os("GST_PLUGIN_SYSTEM_PATH_1_0").is_none() {
            if let Some(dir) = resolved_plugin_dir {
                std::env::set_var("GST_PLUGIN_SYSTEM_PATH_1_0", dir);
            }
        }
        if std::env::var_os("GST_PLUGIN_PATH_1_0").is_none() {
            if let Some(dir) = resolved_plugin_dir {
                std::env::set_var("GST_PLUGIN_PATH_1_0", dir);
            }
        }
        if std::env::var_os("GST_PLUGIN_SCANNER").is_none() {
            let mut scanner_candidates: Vec<PathBuf> = vec![
                PathBuf::from("/usr/lib/gstreamer-1.0/gst-plugin-scanner"),
                PathBuf::from("/usr/lib64/gstreamer-1.0/gst-plugin-scanner"),
                PathBuf::from("/usr/libexec/gstreamer-1.0/gst-plugin-scanner"),
                PathBuf::from("/usr/lib/x86_64-linux-gnu/gstreamer-1.0/gst-plugin-scanner"),
                PathBuf::from("/usr/lib/aarch64-linux-gnu/gstreamer-1.0/gst-plugin-scanner"),
                PathBuf::from("/run/host/usr/lib/gstreamer-1.0/gst-plugin-scanner"),
                PathBuf::from("/run/host/usr/lib64/gstreamer-1.0/gst-plugin-scanner"),
            ];

            if let Some(path_env) = std::env::var_os("PATH") {
                scanner_candidates
                    .extend(std::env::split_paths(&path_env).map(|p| p.join("gst-plugin-scanner")));
            }

            if let Some(scanner) = scanner_candidates.iter().find(|path| path.exists()) {
                std::env::set_var("GST_PLUGIN_SCANNER", scanner.as_os_str());
            }
        }
    }

    // Deep-link primary: hold the forwarding socket for the process lifetime.
    #[cfg(all(feature = "cef", target_os = "linux"))]
    let _deep_link_guard = app_lib::deep_link_ipc::bind_and_listen();

    app_lib::run();
}
