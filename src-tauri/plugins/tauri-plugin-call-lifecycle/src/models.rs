use secrecy::SecretString;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub connection_id: String,
    pub server_url: String,
    pub participant_token: SecretString,
    #[serde(default)]
    pub audio: bool,
    #[serde(default)]
    pub video: bool,
    #[serde(default)]
    pub screen_share: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectRequest {
    pub connection_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlatformCallStateKind {
    Idle,
    Starting,
    Active,
    Stopping,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlatformCallRoute {
    Earpiece,
    Speaker,
    Wired,
    Bluetooth,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlatformCallInterruption {
    Began,
    Ended,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlatformCallFailureCode {
    Unsupported,
    PermissionDenied,
    AudioUnavailable,
    StartFailed,
    StopFailed,
    StaleSession,
    Busy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlatformCallEventKind {
    FocusChanged { focused: bool },
    RouteChanged { route: PlatformCallRoute },
    Interrupted { state: PlatformCallInterruption },
    MediaReset,
    Failed { code: PlatformCallFailureCode },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCallEvent {
    pub revision: u64,
    pub session_id: String,
    #[serde(flatten)]
    pub kind: PlatformCallEventKind,
}

/// Raw platform lifecycle event as emitted by the Android/iOS native plugins.
///
/// Native fields stay as strings at the boundary; the bridge maps them into the
/// bounded guest enums below, dropping unknown values instead of forwarding raw
/// native errors or device names.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlatformCallEvent {
    pub session_id: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub revision: Option<u64>,
    pub event: String,
    #[serde(default)]
    pub focus: Option<String>,
    #[serde(default)]
    pub route: Option<String>,
    #[serde(default)]
    pub interruption: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
}

impl NativePlatformCallEvent {
    pub fn to_kind(&self) -> Option<PlatformCallEventKind> {
        match self.event.as_str() {
            // Android reports "gained"|"lost"|"ducked"; iOS reports "active"|"lost"|"regained".
            "focus" => Some(PlatformCallEventKind::FocusChanged {
                focused: matches!(
                    self.focus.as_deref(),
                    Some("gained" | "active" | "regained")
                ),
            }),
            // Union of Android (earpiece|speaker|wired|bluetooth|usb|unknown)
            // and iOS (receiver|speaker|bluetooth|wired|other|none) routes.
            "route" => Some(PlatformCallEventKind::RouteChanged {
                route: match self.route.as_deref() {
                    Some("earpiece" | "receiver") => PlatformCallRoute::Earpiece,
                    Some("speaker") => PlatformCallRoute::Speaker,
                    Some("wired") => PlatformCallRoute::Wired,
                    Some("bluetooth") => PlatformCallRoute::Bluetooth,
                    _ => PlatformCallRoute::Unknown,
                },
            }),
            "interruption" => Some(PlatformCallEventKind::Interrupted {
                state: match self.interruption.as_deref() {
                    Some("began") => PlatformCallInterruption::Began,
                    _ => PlatformCallInterruption::Ended,
                },
            }),
            "media_services_reset" => Some(PlatformCallEventKind::MediaReset),
            // Android: invalid_request|busy|not_visible|permission_denied|
            // audio_focus_failed|service_start_failed. iOS: busy|
            // permission_denied|audio_session_failed|stop_failed.
            "failure" => Some(PlatformCallEventKind::Failed {
                code: match self.code.as_deref() {
                    Some("busy") => PlatformCallFailureCode::Busy,
                    Some("permission_denied") => PlatformCallFailureCode::PermissionDenied,
                    Some("audio_focus_failed" | "audio_session_failed") => {
                        PlatformCallFailureCode::AudioUnavailable
                    }
                    Some("stop_failed") => PlatformCallFailureCode::StopFailed,
                    _ => PlatformCallFailureCode::StartFailed,
                },
            }),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn native_event(event: &str) -> NativePlatformCallEvent {
        NativePlatformCallEvent {
            session_id: "session".into(),
            revision: None,
            event: event.into(),
            focus: None,
            route: None,
            interruption: None,
            code: None,
        }
    }

    #[test]
    fn native_focus_maps_to_bounded_focused_flag() {
        for (raw, focused) in [
            ("gained", true),
            ("active", true),
            ("regained", true),
            ("lost", false),
            ("ducked", false),
        ] {
            let mut event = native_event("focus");
            event.focus = Some(raw.into());
            assert_eq!(
                event.to_kind(),
                Some(PlatformCallEventKind::FocusChanged { focused }),
                "focus {raw}"
            );
        }
        assert_eq!(
            native_event("focus").to_kind(),
            Some(PlatformCallEventKind::FocusChanged { focused: false })
        );
    }

    #[test]
    fn native_route_maps_to_bounded_route_without_device_names() {
        for (raw, route) in [
            ("earpiece", PlatformCallRoute::Earpiece),
            ("receiver", PlatformCallRoute::Earpiece),
            ("speaker", PlatformCallRoute::Speaker),
            ("wired", PlatformCallRoute::Wired),
            ("bluetooth", PlatformCallRoute::Bluetooth),
            ("usb", PlatformCallRoute::Unknown),
            ("other", PlatformCallRoute::Unknown),
            ("none", PlatformCallRoute::Unknown),
            ("bose-quietcomfort-35", PlatformCallRoute::Unknown),
        ] {
            let mut event = native_event("route");
            event.route = Some(raw.into());
            assert_eq!(
                event.to_kind(),
                Some(PlatformCallEventKind::RouteChanged { route }),
                "route {raw}"
            );
        }
    }

    #[test]
    fn native_interruption_and_reset_map_to_bounded_variants() {
        let mut began = native_event("interruption");
        began.interruption = Some("began".into());
        assert_eq!(
            began.to_kind(),
            Some(PlatformCallEventKind::Interrupted {
                state: PlatformCallInterruption::Began
            })
        );
        let mut ended = native_event("interruption");
        ended.interruption = Some("ended".into());
        assert_eq!(
            ended.to_kind(),
            Some(PlatformCallEventKind::Interrupted {
                state: PlatformCallInterruption::Ended
            })
        );
        assert_eq!(
            native_event("media_services_reset").to_kind(),
            Some(PlatformCallEventKind::MediaReset)
        );
    }

    #[test]
    fn native_failure_codes_map_to_safe_codes() {
        for (raw, code) in [
            ("busy", PlatformCallFailureCode::Busy),
            (
                "permission_denied",
                PlatformCallFailureCode::PermissionDenied,
            ),
            (
                "audio_focus_failed",
                PlatformCallFailureCode::AudioUnavailable,
            ),
            (
                "audio_session_failed",
                PlatformCallFailureCode::AudioUnavailable,
            ),
            ("stop_failed", PlatformCallFailureCode::StopFailed),
            ("invalid_request", PlatformCallFailureCode::StartFailed),
            ("not_visible", PlatformCallFailureCode::StartFailed),
            ("service_start_failed", PlatformCallFailureCode::StartFailed),
            ("Device is muted", PlatformCallFailureCode::StartFailed),
        ] {
            let mut event = native_event("failure");
            event.code = Some(raw.into());
            assert_eq!(
                event.to_kind(),
                Some(PlatformCallEventKind::Failed { code }),
                "code {raw}"
            );
        }
    }

    #[test]
    fn unknown_native_event_is_dropped() {
        assert_eq!(native_event("unknown_thing").to_kind(), None);
    }

    #[test]
    fn native_start_fields_serialize_as_camel_case() {
        let fields = NativePlatformStartFields {
            session_id: "opaque-session",
            microphone: true,
            playback: false,
        };
        assert_eq!(
            serde_json::to_value(fields).unwrap(),
            serde_json::json!({
                "sessionId": "opaque-session",
                "microphone": true,
                "playback": false
            })
        );
    }

    #[test]
    fn native_event_deserializes_android_and_ios_payloads() {
        let android: NativePlatformCallEvent = serde_json::from_value(serde_json::json!({
            "sessionId": "s",
            "revision": 3,
            "event": "route",
            "route": "usb"
        }))
        .unwrap();
        assert_eq!(
            android.to_kind(),
            Some(PlatformCallEventKind::RouteChanged {
                route: PlatformCallRoute::Unknown
            })
        );

        let ios: NativePlatformCallEvent = serde_json::from_value(serde_json::json!({
            "sessionId": "s",
            "revision": 3,
            "event": "interruption",
            "interruption": "began"
        }))
        .unwrap();
        assert_eq!(
            ios.to_kind(),
            Some(PlatformCallEventKind::Interrupted {
                state: PlatformCallInterruption::Began
            })
        );
    }
}

/// The media flags forwarded to the native platform-lifecycle plugins.
///
/// Kept in `models.rs` (not `mobile.rs`, which only compiles on mobile
/// targets) so the wire shape is regression-tested on the host.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlatformStartFields<'a> {
    pub session_id: &'a str,
    pub microphone: bool,
    pub playback: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPlatformCallLifecycleRequest {
    pub session_id: String,
    pub microphone: bool,
    pub playback: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopPlatformCallLifecycleRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCallCapabilities {
    pub supported: bool,
    pub microphone: bool,
    pub playback: bool,
}

impl PlatformCallCapabilities {
    pub fn current() -> Self {
        let supported = cfg!(any(target_os = "android", target_os = "ios"));
        Self {
            supported,
            microphone: supported,
            playback: supported,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCallState {
    pub revision: u64,
    pub state: PlatformCallStateKind,
    pub session_id: Option<String>,
    pub microphone: bool,
    pub playback: bool,
    pub capabilities: PlatformCallCapabilities,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    Microphone,
    Camera,
    ScreenShare,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMediaEnabledRequest {
    pub connection_id: String,
    pub kind: MediaKind,
    pub enabled: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub microphone: bool,
    pub camera: bool,
    pub screen_share: bool,
}

impl MediaState {
    pub fn enabled(&self, kind: MediaKind) -> bool {
        match kind {
            MediaKind::Microphone => self.microphone,
            MediaKind::Camera => self.camera,
            MediaKind::ScreenShare => self.screen_share,
        }
    }

    pub fn set(&mut self, kind: MediaKind, enabled: bool) {
        match kind {
            MediaKind::Microphone => self.microphone = enabled,
            MediaKind::Camera => self.camera = enabled,
            MediaKind::ScreenShare => self.screen_share = enabled,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCapabilities {
    pub microphone: bool,
    pub camera: bool,
    pub screen_share: bool,
}

impl MediaCapabilities {
    pub fn current() -> Self {
        let desktop = cfg!(any(
            target_os = "linux",
            target_os = "macos",
            target_os = "windows"
        ));
        Self {
            microphone: cfg!(any(
                target_os = "linux",
                target_os = "android",
                target_os = "ios"
            )),
            camera: desktop || cfg!(any(target_os = "android", target_os = "ios")),
            screen_share: desktop || cfg!(target_os = "android"),
        }
    }

    pub fn supports(&self, kind: MediaKind) -> bool {
        match kind {
            MediaKind::Microphone => self.microphone,
            MediaKind::Camera => self.camera,
            MediaKind::ScreenShare => self.screen_share,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Idle,
    Connecting,
    Connected,
    Reconnecting,
    Disconnecting,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallState {
    pub revision: u64,
    pub state: ConnectionState,
    pub connection_id: Option<String>,
    pub media: MediaState,
    pub capabilities: MediaCapabilities,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallLifecycleError {
    pub revision: u64,
    pub code: &'static str,
    pub message: &'static str,
    pub connection_id: Option<String>,
}
