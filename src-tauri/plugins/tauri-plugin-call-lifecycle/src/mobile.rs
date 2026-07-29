use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};
use tokio::sync::mpsc;

use crate::{
    error::Error,
    models::{NativePlatformCallEvent, NativePlatformStartFields, PlatformCallCapabilities},
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.call_lifecycle";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_call_lifecycle);

#[cfg(target_os = "android")]
mod platform_commands {
    pub(super) const CAPABILITIES: &str = "getPlatformLifecycleCapabilities";
    pub(super) const START: &str = "startPlatformLifecycle";
    pub(super) const STOP: &str = "stopPlatformLifecycle";
}

#[cfg(target_os = "ios")]
mod platform_commands {
    pub(super) const CAPABILITIES: &str = "capabilities";
    pub(super) const START: &str = "start";
    pub(super) const STOP: &str = "stop";
}

/// Mirrors the Android `getPlatformLifecycleCapabilities` response.
#[cfg(target_os = "android")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativePlatformCapabilities {
    #[serde(default)]
    microphone: bool,
    #[serde(default)]
    audio_playback: bool,
}

/// Mirrors the iOS `capabilities` response.
#[cfg(target_os = "ios")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativePlatformCapabilities {
    #[serde(default)]
    microphone: bool,
    #[serde(default)]
    background_audio: bool,
}

impl From<NativePlatformCapabilities> for PlatformCallCapabilities {
    fn from(native: NativePlatformCapabilities) -> Self {
        // A native response is proof the platform lifecycle exists.
        Self {
            supported: true,
            microphone: native.microphone,
            #[cfg(target_os = "android")]
            playback: native.audio_playback,
            #[cfg(target_os = "ios")]
            playback: native.background_audio,
        }
    }
}

#[derive(Clone)]
pub(crate) struct MobileBackend<R: Runtime> {
    handle: PluginHandle<R>,
}

impl<R: Runtime> MobileBackend<R> {
    pub(crate) fn new(handle: PluginHandle<R>) -> Self {
        Self { handle }
    }

    pub(crate) fn platform_event_channel(
        sender: mpsc::Sender<NativePlatformCallEvent>,
    ) -> Channel<NativePlatformCallEvent> {
        Channel::new(move |body: InvokeResponseBody| {
            if let Ok(event) = body.deserialize::<NativePlatformCallEvent>() {
                let _ = sender.try_send(event);
            }
            Ok(())
        })
    }

    pub(crate) async fn get_platform_call_capabilities(
        &self,
    ) -> crate::Result<PlatformCallCapabilities> {
        let native: NativePlatformCapabilities = self
            .handle
            .run_mobile_plugin_async(platform_commands::CAPABILITIES, ())
            .await
            .map_err(|_| Error::PlatformCallUnsupported)?;
        Ok(native.into())
    }

    pub(crate) async fn start_platform_call_lifecycle(
        &self,
        request: NativeStartPlatformCallLifecycleRequest<'_>,
    ) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin_async::<serde_json::Value>(platform_commands::START, request)
            .await
            .map(|_| ())
            .map_err(|_| Error::PlatformCallStartFailed)
    }

    pub(crate) async fn stop_platform_call_lifecycle(
        &self,
        request: NativeStopPlatformCallLifecycleRequest<'_>,
    ) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin_async::<serde_json::Value>(platform_commands::STOP, request)
            .await
            .map(|_| ())
            .map_err(|_| Error::PlatformCallStopFailed)
    }
}

/// Native start payload. The natives accept `{ sessionId, channel }` and
/// tolerate the extra `microphone`/`playback` flags, which the bridge forwards
/// so later stages do not need to re-extend the payload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeStartPlatformCallLifecycleRequest<'a> {
    #[serde(flatten)]
    pub fields: NativePlatformStartFields<'a>,
    pub channel: Channel<NativePlatformCallEvent>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeStopPlatformCallLifecycleRequest<'a> {
    pub session_id: &'a str,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<MobileBackend<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "CallLifecyclePlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_call_lifecycle)?;
    Ok(MobileBackend::new(handle))
}
