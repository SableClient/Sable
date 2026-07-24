// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
            command_line_args: vec![
                ("--disable-gpu-sandbox".into(), None),
                ("--disable-font-subpixel-positioning".into(), None),
                ("--enable-font-antialiasing".into(), None),
                ("autoplay-policy".into(), Some("no-user-gesture-required".into())),
                ("enable-features".into(), Some("SharedArrayBuffer".into())),
                ("--disable-background-timer-throttling".into(), None),
                ("--disable-renderer-backgrounding".into(), None),
                ("--disable-backgrounding-occluded-windows".into(), None),
                ("disable-features".into(), Some(
                    "SpareRendererForSitePerProcess,IntensiveWakeUpThrottling,CalculateNativeWinOcclusion,AutofillActorMode,GlicActorUi,LensOverlay".into()
                )),
            ],
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

        // Allow call media capture (mic, camera, screen-share) for our webview.
        tauri_runtime_cef::set_permission_policy(|request, responder| {
            use tauri_runtime_cef::{DenyReason, PermissionKind, Verdict};
            if request.webview_label == "main" {
                let verdicts = request
                    .kinds
                    .iter()
                    .map(|kind| match kind {
                        PermissionKind::Microphone
                        | PermissionKind::Camera
                        | PermissionKind::CameraPanTiltZoom
                        | PermissionKind::ScreenCapture
                        | PermissionKind::CapturedSurfaceControl => Verdict::Allow,
                        _ => Verdict::Deny,
                    })
                    .collect();
                return responder.decide(verdicts);
            }
            responder.deny(DenyReason::NoPolicy)
        });
    }

    // Force X11/XWayland: the tray's GTK needs it, and the CEF runtime's Wayland
    // window path is unstable (crate verified on X11 only).
    #[cfg(target_os = "linux")]
    unsafe {
        // Tao/Tauri Wayland decorations are don't respect server side decorations, forcing GTK onto X11/XWayland for now.
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
