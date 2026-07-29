use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod actor;
mod commands;
mod error;
#[cfg(mobile)]
mod mobile;
mod models;

pub use error::{Error, Result};

use actor::CallLifecycle;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the call-lifecycle APIs.
pub trait CallLifecycleExt<R: Runtime> {
    fn call_lifecycle(&self) -> &CallLifecycle<R>;
}

impl<R: Runtime, T: Manager<R>> crate::CallLifecycleExt<R> for T {
    fn call_lifecycle(&self) -> &CallLifecycle<R> {
        self.state::<CallLifecycle<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("call-lifecycle")
        .invoke_handler(tauri::generate_handler![
            commands::getPlatformCallCapabilities,
            commands::startPlatformCallLifecycle,
            commands::stopPlatformCallLifecycle,
            commands::getPlatformCallState
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let mobile_backend = mobile::init(app, api)?;
            #[cfg(not(mobile))]
            let _ = api;

            #[cfg(mobile)]
            let call_lifecycle = CallLifecycle::new(app.clone(), mobile_backend);
            #[cfg(not(mobile))]
            let call_lifecycle = CallLifecycle::new(app.clone());
            app.manage(call_lifecycle);
            Ok(())
        })
        .build()
}
