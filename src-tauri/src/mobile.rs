// Native status-bar tinting. The webview draws edge-to-edge under a transparent
// status bar, so only Window.setStatusBarColor can color that region. Rust can't
// reach the Activity directly (ndk-context isn't populated by Tauri), so
// MainActivity hands us the JavaVM on create and we call back into a static
// method that owns the window.

use std::sync::OnceLock;

use jni::objects::{JObject, JValue};
use jni::strings::JNIString;
use jni::{jni_sig, jni_str, EnvUnowned, JavaVM};
use tauri::{AppHandle, Emitter};

static JAVA_VM: OnceLock<JavaVM> = OnceLock::new();
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn set_app_handle(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
}

// Called by MainActivity.onCreate to cache the JavaVM for later callbacks.
#[no_mangle]
pub extern "system" fn Java_moe_sable_client_MainActivity_nativeInitStatusBar(
    mut env: EnvUnowned,
    _this: JObject,
) {
    let _ = env.with_env(|env| {
        let vm = env.get_java_vm()?;
        let _ = JAVA_VM.set(vm);
        Ok::<_, jni::errors::Error>(())
    });
}

#[no_mangle]
pub extern "system" fn Java_moe_sable_client_MainActivity_nativeShareReceived(
    _env: EnvUnowned,
    _this: JObject,
) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("share-received", ());
    }
}

/// `color` is a packed ARGB int (as produced by Android's `Color`).
#[tauri::command]
pub fn set_status_bar_color(color: u32) -> Result<(), String> {
    call_bar_color("setStatusBarColorNative", color)
}

/// `color` is a packed ARGB int (as produced by Android's `Color`).
#[tauri::command]
pub fn set_navigation_bar_color(color: u32) -> Result<(), String> {
    call_bar_color("setNavigationBarColorNative", color)
}

/// `color` is a packed ARGB int (as produced by Android's `Color`).
#[tauri::command]
pub fn set_window_background_color(color: u32) -> Result<(), String> {
    call_bar_color("setWindowBackgroundColorNative", color)
}

#[tauri::command]
pub fn set_immersive_mode(enabled: bool) -> Result<(), String> {
    let vm = JAVA_VM.get().ok_or("java vm not initialized")?;
    vm.attach_current_thread(|env| {
        let result = env.call_static_method(
            jni_str!("moe/sable/client/MainActivity"),
            jni_str!("setImmersiveModeNative"),
            jni_sig!("(Z)V"),
            &[JValue::Bool(enabled)],
        );
        if result.is_err() {
            let _ = env.exception_clear();
        }
        result.map(|_| ())
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_call_foreground_service() -> Result<(), String> {
    call_static_method("startCallForegroundServiceNative")
}

#[tauri::command]
pub fn stop_call_foreground_service() -> Result<(), String> {
    call_static_method("stopCallForegroundServiceNative")
}

/// `kind` is "notification" or "invite"; mapped to an int to avoid JNI string
/// marshalling (mirrors set_*_bar_color).
pub(crate) fn play_notification_sound(kind: String) -> Result<(), String> {
    let code = match kind.as_str() {
        "invite" => 1,
        _ => 0,
    };
    let vm = JAVA_VM.get().ok_or("java vm not initialized")?;
    vm.attach_current_thread(|env| {
        let result = env.call_static_method(
            jni_str!("moe/sable/client/MainActivity"),
            jni_str!("playNotificationSoundNative"),
            jni_sig!("(I)V"),
            &[JValue::Int(code)],
        );
        if result.is_err() {
            let _ = env.exception_clear();
        }
        result.map(|_| ())
    })
    .map_err(|e| e.to_string())
}

fn call_bar_color(method: &str, color: u32) -> Result<(), String> {
    let vm = JAVA_VM.get().ok_or("java vm not initialized")?;
    vm.attach_current_thread(|env| {
        let result = env.call_static_method(
            jni_str!("moe/sable/client/MainActivity"),
            JNIString::new(method),
            jni_sig!("(I)V"),
            &[JValue::Int(color as i32)],
        );
        if result.is_err() {
            let _ = env.exception_clear();
        }
        result.map(|_| ())
    })
    .map_err(|e| e.to_string())
}

fn call_static_method(method: &str) -> Result<(), String> {
    let vm = JAVA_VM.get().ok_or("java vm not initialized")?;
    vm.attach_current_thread(|env| {
        let result = env.call_static_method(
            jni_str!("moe/sable/client/MainActivity"),
            JNIString::new(method),
            jni_sig!("()V"),
            &[],
        );
        if result.is_err() {
            let _ = env.exception_clear();
        }
        result.map(|_| ())
    })
    .map_err(|e| e.to_string())
}
