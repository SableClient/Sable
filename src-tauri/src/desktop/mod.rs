pub mod download;
pub mod menu;
pub mod runtime_state;
pub mod settings;
pub mod tray;
#[cfg(target_os = "linux")]
pub mod tray_badge;

#[cfg(windows)]
pub mod windows;
