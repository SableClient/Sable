#[cfg(windows)]
#[path = "snap_overlay.rs"]
pub mod snap_overlay;
#[cfg(not(windows))]
#[path = "snap_overlay_stub.rs"]
pub mod snap_overlay;

#[cfg(windows)]
#[path = "window_tracking.rs"]
pub mod window_tracking;
#[cfg(not(windows))]
#[path = "window_tracking_stub.rs"]
pub mod window_tracking;
