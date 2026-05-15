// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    unsafe {
        use std::path::{Path, PathBuf};

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
                scanner_candidates.extend(std::env::split_paths(&path_env).map(|p| p.join("gst-plugin-scanner")));
            }

            if let Some(scanner) = scanner_candidates.iter().find(|path| path.exists()) {
                std::env::set_var("GST_PLUGIN_SCANNER", scanner.as_os_str());
            }
        }
    }

    app_lib::run();
}
