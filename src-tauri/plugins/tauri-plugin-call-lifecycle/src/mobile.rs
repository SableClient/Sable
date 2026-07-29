use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};
use tokio::sync::mpsc;

use crate::{
    error::Error,
    models::{
        DisconnectRequest, MediaKind, NativePlatformCallEvent, NativePlatformStartFields,
        PlatformCallCapabilities,
    },
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.call_lifecycle";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_call_lifecycle);

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum NativeFailureCode {
    Busy,
    ConnectFailed,
    StaleConnection,
    CloseFailed,
    ActorUnavailable,
    AudioFailed,
    VideoFailed,
    CameraFailed,
    ScreenShareFailed,
}

impl NativeFailureCode {
    fn error(self) -> Error {
        match self {
            Self::Busy => Error::Busy,
            Self::ConnectFailed => Error::ConnectFailed,
            Self::StaleConnection => Error::StaleConnection,
            Self::CloseFailed => Error::CloseFailed,
            Self::ActorUnavailable => Error::ActorUnavailable,
            Self::AudioFailed => Error::AudioFailed,
            Self::VideoFailed => Error::VideoFailed,
            Self::CameraFailed => Error::CameraFailed,
            Self::ScreenShareFailed => Error::ScreenShareFailed,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeControlEvent {
    pub operation_id: String,
    pub connection_id: String,
    #[serde(flatten)]
    pub kind: NativeControlEventKind,
}

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

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub(crate) enum NativeControlEventKind {
    Reconnecting,
    Reconnected,
    Disconnected,
    Failed { code: NativeFailureCode },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeConnectRequest<'a> {
    pub operation_id: &'a str,
    pub connection_id: &'a str,
    pub server_url: &'a str,
    pub participant_token: &'a secrecy::SecretString,
    pub audio: bool,
    pub video: bool,
    pub screen_share: bool,
    pub channel: Channel<NativeControlEvent>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeConnectResponse {
    pub operation_id: String,
    pub connection_id: String,
}

#[derive(Clone)]
pub(crate) struct MobileBackend<R: Runtime> {
    handle: PluginHandle<R>,
}

impl<R: Runtime> MobileBackend<R> {
    pub(crate) fn new(handle: PluginHandle<R>) -> Self {
        Self { handle }
    }

    pub(crate) fn event_channel(
        sender: mpsc::Sender<NativeControlEvent>,
    ) -> Channel<NativeControlEvent> {
        Channel::new(move |body: InvokeResponseBody| {
            if let Ok(event) = body.deserialize::<NativeControlEvent>() {
                let _ = sender.try_send(event);
            }
            Ok(())
        })
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

    pub(crate) async fn connect(
        &self,
        request: NativeConnectRequest<'_>,
    ) -> crate::Result<NativeConnectResponse> {
        self.handle
            .run_mobile_plugin_async("connect", request)
            .await
            .map_err(|_| Error::ConnectFailed)
    }

    pub(crate) async fn disconnect(
        &self,
        request: DisconnectRequest,
        operation_id: &str,
    ) -> crate::Result<()> {
        let payload = NativeDisconnectRequest {
            operation_id,
            connection_id: &request.connection_id,
        };
        self.handle
            .run_mobile_plugin_async::<serde_json::Value>("disconnect", payload)
            .await
            .map(|_| ())
            .map_err(|_| Error::CloseFailed)
    }

    pub(crate) async fn set_media_enabled(
        &self,
        operation_id: &str,
        connection_id: &str,
        kind: MediaKind,
        enabled: bool,
    ) -> crate::Result<()> {
        let payload = NativeSetMediaEnabledRequest {
            operation_id,
            connection_id,
            kind,
            enabled,
        };
        self.handle
            .run_mobile_plugin_async::<serde_json::Value>("setMediaEnabled", payload)
            .await
            .map(|_| ())
            .map_err(|_| match kind {
                MediaKind::Microphone => Error::AudioFailed,
                MediaKind::Camera => Error::CameraFailed,
                MediaKind::ScreenShare => Error::ScreenShareFailed,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeDisconnectRequest<'a> {
    operation_id: &'a str,
    connection_id: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeSetMediaEnabledRequest<'a> {
    operation_id: &'a str,
    connection_id: &'a str,
    kind: MediaKind,
    enabled: bool,
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
