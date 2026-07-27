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
pub(crate) async fn get_state<R: Runtime>(app: AppHandle<R>) -> Result<CallState> {
    app.call_lifecycle().get_state().await
}
