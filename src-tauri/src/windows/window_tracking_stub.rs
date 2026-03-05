use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone, Type)]
pub struct WindowInfo {
    pub mouse_x: i32,
    pub mouse_y: i32,
    pub window_class: Option<String>,
    pub exe_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone, Type)]
pub struct WindowTarget {
    pub window_class: Option<String>,
    pub exe_name: Option<String>,
}

impl WindowTarget {
    pub fn new(window_class: Option<String>, exe_name: Option<String>) -> Self {
        Self {
            window_class,
            exe_name,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone, Type)]
pub enum EventType {
    Started,
    TargetLost,
    Timeout,
    Stopped,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone, Type)]
pub struct TrackingEvent {
    pub event_type: EventType,
    pub window_info: Option<WindowInfo>,
    pub target: WindowTarget,
    pub message: String,
}

pub struct TrackingState {
    active: AtomicBool,
}

impl TrackingState {
    pub fn new() -> Self {
        Self {
            active: AtomicBool::new(false),
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }
}

impl Default for TrackingState {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
#[specta::specta]
pub async fn start_window_tracking_with_target(
    app_handle: AppHandle,
    target: WindowTarget,
    tracking_state: State<'_, Arc<TrackingState>>,
) -> Result<(), String> {
    let _ = (app_handle, target, tracking_state);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn stop_window_tracking(
    app_handle: AppHandle,
    tracking_state: State<'_, Arc<TrackingState>>,
) -> Result<(), String> {
    let _ = (app_handle, tracking_state);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn is_window_tracking_active(
    tracking_state: State<'_, Arc<TrackingState>>,
) -> Result<bool, String> {
    Ok(tracking_state.is_active())
}
