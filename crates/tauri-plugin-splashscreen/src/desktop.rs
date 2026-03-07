use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<Splashscreen<R>> {
  Ok(Splashscreen(app.clone()))
}

/// Access to the splashscreen APIs.
pub struct Splashscreen<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Splashscreen<R> {
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    Ok(PingResponse {
      value: payload.value,
    })
  }

  pub fn close(&self) -> crate::Result<()> {
    Ok(())
  }
}
