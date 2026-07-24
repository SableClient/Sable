use std::{
    ffi::OsString,
    os::windows::ffi::OsStringExt,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use windows::Win32::{
    Foundation::{CloseHandle, HWND, POINT},
    System::{
        ProcessStatus::GetModuleBaseNameW,
        Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
    },
    UI::WindowsAndMessaging::{
        GetClassNameW, GetCursorPos, GetWindowThreadProcessId, WindowFromPoint,
    },
};

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct WindowInfo {
    pub mouse_x: i32,
    pub mouse_y: i32,
    pub window_class: Option<String>,
    pub exe_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
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

    pub fn matches(&self, window_info: &WindowInfo) -> bool {
        let class_matches = match &self.window_class {
            Some(target_class) => window_info
                .window_class
                .as_ref()
                .map(|class| class.eq_ignore_ascii_case(target_class))
                .unwrap_or(false),
            None => true,
        };

        let exe_matches = match &self.exe_name {
            Some(target_exe) => window_info
                .exe_name
                .as_ref()
                .map(|exe| exe.eq_ignore_ascii_case(target_exe))
                .unwrap_or(false),
            None => true,
        };

        class_matches && exe_matches
    }
}

impl WindowInfo {
    pub fn matches_target(&self, target: &WindowTarget) -> bool {
        target.matches(self)
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub enum EventType {
    Started,
    TargetLost,
    Timeout,
    Stopped,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
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

    pub fn set_active(&self, active: bool) {
        self.active.store(active, Ordering::Relaxed);
    }
}

impl Default for TrackingState {
    fn default() -> Self {
        Self::new()
    }
}

fn get_window_class_name(hwnd: HWND) -> Result<String, Box<dyn std::error::Error>> {
    let mut buffer = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if len == 0 {
        return Err("Failed to get class name".into());
    }
    Ok(OsString::from_wide(&buffer[..len as usize])
        .to_string_lossy()
        .into_owned())
}

fn get_exe_name_from_window(hwnd: HWND) -> Result<String, Box<dyn std::error::Error>> {
    let mut process_id = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
    }
    if process_id == 0 {
        return Err("Failed to get process id".into());
    }

    let process_handle = unsafe {
        OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            false,
            process_id,
        )
    }?;

    let mut buffer = [0u16; 260];
    let len = unsafe { GetModuleBaseNameW(process_handle, None, &mut buffer) };
    let _ = unsafe { CloseHandle(process_handle) };

    if len == 0 {
        return Err("Failed to get process name".into());
    }

    Ok(OsString::from_wide(&buffer[..len as usize])
        .to_string_lossy()
        .into_owned())
}

fn get_window_info() -> Result<WindowInfo, Box<dyn std::error::Error>> {
    let mut point = POINT { x: 0, y: 0 };
    unsafe { GetCursorPos(&raw mut point) }?;

    let hwnd = unsafe { WindowFromPoint(point) };

    let window_class = if !hwnd.0.is_null() {
        get_window_class_name(hwnd).ok()
    } else {
        None
    };

    let exe_name = if !hwnd.0.is_null() {
        get_exe_name_from_window(hwnd).ok()
    } else {
        None
    };

    Ok(WindowInfo {
        mouse_x: point.x,
        mouse_y: point.y,
        window_class,
        exe_name,
    })
}

async fn track_window_hover_with_target(
    app_handle: AppHandle<crate::BrowserEngine>,
    target: WindowTarget,
    tracking_state: Arc<TrackingState>,
) {
    let start_time = Instant::now();
    let timeout_duration = Duration::from_millis(200);
    let check_interval = Duration::from_millis(100);

    let mut was_on_target = false;

    while tracking_state.is_active() {
        if start_time.elapsed() >= timeout_duration && !was_on_target {
            let event = TrackingEvent {
                event_type: EventType::Timeout,
                window_info: None,
                target: target.clone(),
                message: "Tracking timed out before reaching target".to_owned(),
            };

            let _ = app_handle.emit("window-tracking", &event);
            tracking_state.set_active(false);
            break;
        }

        if let Ok(window_info) = get_window_info() {
            let is_on_target = window_info.matches_target(&target);

            if was_on_target && !is_on_target {
                let event = TrackingEvent {
                    event_type: EventType::TargetLost,
                    window_info: Some(window_info),
                    target: target.clone(),
                    message: "Pointer moved away from snap popup".to_owned(),
                };
                let _ = app_handle.emit("window-tracking", &event);
                tracking_state.set_active(false);
                break;
            }

            was_on_target = is_on_target;
        }

        tokio::time::sleep(check_interval).await;
    }
}

#[tauri::command]
pub async fn start_window_tracking_with_target(
    app_handle: AppHandle<crate::BrowserEngine>,
    target: WindowTarget,
    tracking_state: State<'_, Arc<TrackingState>>,
) -> Result<(), String> {
    if tracking_state.is_active() {
        return Ok(());
    }

    tracking_state.set_active(true);

    let event = TrackingEvent {
        event_type: EventType::Started,
        window_info: None,
        target: target.clone(),
        message: "Window tracking started".to_owned(),
    };

    app_handle
        .emit("window-tracking", &event)
        .map_err(|error| format!("Failed to emit start event: {error}"))?;

    let app_handle_clone = app_handle.clone();
    let tracking_state_clone = tracking_state.inner().clone();

    tauri::async_runtime::spawn(async move {
        track_window_hover_with_target(app_handle_clone, target, tracking_state_clone).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_window_tracking(
    app_handle: AppHandle<crate::BrowserEngine>,
    tracking_state: State<'_, Arc<TrackingState>>,
) -> Result<(), String> {
    if !tracking_state.is_active() {
        return Ok(());
    }

    tracking_state.set_active(false);

    let event = TrackingEvent {
        event_type: EventType::Stopped,
        window_info: None,
        target: WindowTarget::new(None, None),
        message: "Window tracking stopped".to_owned(),
    };

    app_handle
        .emit("window-tracking", &event)
        .map_err(|error| format!("Failed to emit stop event: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn is_window_tracking_active(
    tracking_state: State<'_, Arc<TrackingState>>,
) -> Result<bool, String> {
    Ok(tracking_state.is_active())
}
