use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_splashscreen);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<Splashscreen<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("moe.sable.app.plugin.splashscreen", "SplashScreenPlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_splashscreen)?;
  Ok(Splashscreen(handle))
}

/// Access to the splashscreen APIs.
pub struct Splashscreen<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Splashscreen<R> {
  pub fn ping(&self, payload: PingRequest) -> crate::Result<PingResponse> {
    self
      .0
      .run_mobile_plugin("ping", payload)
      .map_err(Into::into)
  }

  pub fn close(&self) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin("close", ())
      .map_err(Into::into)
  }
}
