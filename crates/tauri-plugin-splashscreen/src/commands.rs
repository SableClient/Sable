use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::SplashscreenExt;

#[command]
pub(crate) async fn ping<R: Runtime>(
    app: AppHandle<R>,
    payload: PingRequest,
) -> Result<PingResponse> {
    app.splashscreen().ping(payload)
}

#[command]
pub(crate) async fn close<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.splashscreen().close()
}
