// The attribute is aliased to `tauri_command` on purpose: tauri-typegen scans
// every .rs file under `src-tauri/` and treats a bare `#[command]` attribute as
// a root command, which would emit unusable unprefixed root bindings for these
// namespaced plugin commands that the guest-js API already exposes.
use tauri::{command as tauri_command, AppHandle, Runtime};

use crate::models::*;
use crate::CallLifecycleExt;
use crate::Result;

#[allow(non_snake_case)]
#[tauri_command]
pub(crate) async fn getPlatformCallCapabilities<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PlatformCallCapabilities> {
    app.call_lifecycle().get_platform_call_capabilities().await
}

#[allow(non_snake_case)]
#[tauri_command]
pub(crate) async fn startPlatformCallLifecycle<R: Runtime>(
    app: AppHandle<R>,
    payload: StartPlatformCallLifecycleRequest,
) -> Result<PlatformCallState> {
    app.call_lifecycle()
        .start_platform_call_lifecycle(payload)
        .await
}

#[allow(non_snake_case)]
#[tauri_command]
pub(crate) async fn stopPlatformCallLifecycle<R: Runtime>(
    app: AppHandle<R>,
    payload: StopPlatformCallLifecycleRequest,
) -> Result<PlatformCallState> {
    app.call_lifecycle()
        .stop_platform_call_lifecycle(payload)
        .await
}

#[allow(non_snake_case)]
#[tauri_command]
pub(crate) async fn getPlatformCallState<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PlatformCallState> {
    app.call_lifecycle().get_platform_call_state().await
}
