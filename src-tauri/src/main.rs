// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
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

    app_lib::run();
}
