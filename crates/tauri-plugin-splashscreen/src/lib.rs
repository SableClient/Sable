use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::Splashscreen;
#[cfg(mobile)]
use mobile::Splashscreen;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the splashscreen APIs.
pub trait SplashscreenExt<R: Runtime> {
  fn splashscreen(&self) -> &Splashscreen<R>;
}

impl<R: Runtime, T: Manager<R>> crate::SplashscreenExt<R> for T {
  fn splashscreen(&self) -> &Splashscreen<R> {
    self.state::<Splashscreen<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("splashscreen")
    .invoke_handler(tauri::generate_handler![commands::ping, commands::close])
    .setup(|app, api| {
      #[cfg(mobile)]
      let splashscreen = mobile::init(app, api)?;
      #[cfg(desktop)]
      let splashscreen = desktop::init(app, api)?;
      app.manage(splashscreen);
      Ok(())
    })
    .build()
}
