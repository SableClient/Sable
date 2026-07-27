use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod actor;
mod commands;
mod error;
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
            commands::connect,
            commands::disconnect,
            commands::get_state
        ])
        .setup(|app, _api| {
            let call_lifecycle = CallLifecycle::new(app.clone());
            app.manage(call_lifecycle);
            Ok(())
        })
        .build()
}
