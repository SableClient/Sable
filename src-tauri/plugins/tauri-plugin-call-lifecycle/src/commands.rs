use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::CallLifecycleExt;
use crate::Result;

#[command]
pub(crate) async fn connect<R: Runtime>(
    app: AppHandle<R>,
    payload: ConnectRequest,
) -> Result<CallState> {
    app.call_lifecycle().connect(payload).await
}

#[command]
pub(crate) async fn disconnect<R: Runtime>(
    app: AppHandle<R>,
    payload: DisconnectRequest,
) -> Result<CallState> {
    app.call_lifecycle().disconnect(payload).await
}

#[command]
pub(crate) async fn set_media_enabled<R: Runtime>(
    app: AppHandle<R>,
    payload: SetMediaEnabledRequest,
) -> Result<CallState> {
    app.call_lifecycle().set_media_enabled(payload).await
}

#[command]
pub(crate) async fn get_state<R: Runtime>(app: AppHandle<R>) -> Result<CallState> {
    app.call_lifecycle().get_state().await
}

#[allow(non_snake_case)]
#[command]
pub(crate) async fn getPlatformCallCapabilities<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PlatformCallCapabilities> {
    app.call_lifecycle().get_platform_call_capabilities().await
}

#[allow(non_snake_case)]
#[command]
pub(crate) async fn startPlatformCallLifecycle<R: Runtime>(
    app: AppHandle<R>,
    payload: StartPlatformCallLifecycleRequest,
) -> Result<PlatformCallState> {
    app.call_lifecycle()
        .start_platform_call_lifecycle(payload)
        .await
}

#[allow(non_snake_case)]
#[command]
pub(crate) async fn stopPlatformCallLifecycle<R: Runtime>(
    app: AppHandle<R>,
    payload: StopPlatformCallLifecycleRequest,
) -> Result<PlatformCallState> {
    app.call_lifecycle()
        .stop_platform_call_lifecycle(payload)
        .await
}

#[allow(non_snake_case)]
#[command]
pub(crate) async fn getPlatformCallState<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PlatformCallState> {
    app.call_lifecycle().get_platform_call_state().await
}
