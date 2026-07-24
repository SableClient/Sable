// Native status-bar tinting. The webview draws edge-to-edge under a transparent
// status bar, so only Window.setStatusBarColor can color that region. Rust can't
// reach the Activity directly (ndk-context isn't populated by Tauri), so
// MainActivity hands us the JavaVM on create and we call back into a static
// method that owns the window.

use std::sync::OnceLock;

use jni::objects::{JObject, JValue};
use jni::{JNIEnv, JavaVM};

static JAVA_VM: OnceLock<JavaVM> = OnceLock::new();

// Called by MainActivity.onCreate to cache the JavaVM for later callbacks.
#[no_mangle]
pub extern "system" fn Java_moe_sable_client_MainActivity_nativeInitStatusBar(
    env: JNIEnv,
    _this: JObject,
) {
    if let Ok(vm) = env.get_java_vm() {
        let _ = JAVA_VM.set(vm);
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

fn call_bar_color(method: &str, color: u32) -> Result<(), String> {
    let vm = JAVA_VM.get().ok_or("java vm not initialized")?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;

    let result = env.call_static_method(
        "moe/sable/client/MainActivity",
        method,
        "(I)V",
        &[JValue::Int(color as i32)],
    );
    if result.is_err() {
        let _ = env.exception_clear();
    }
    result.map_err(|e| e.to_string())?;

    Ok(())
}
