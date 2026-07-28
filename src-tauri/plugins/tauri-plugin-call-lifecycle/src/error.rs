use serde::{ser::SerializeStruct, ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("call is already active")]
    Busy,
    #[error("call connection failed")]
    ConnectFailed,
    #[error("connection ID does not match active call")]
    StaleConnection,
    #[error("call shutdown failed")]
    CloseFailed,
    #[error("call lifecycle actor unavailable")]
    ActorUnavailable,
    #[error("native audio failed")]
    AudioFailed,
    #[error("native video failed")]
    VideoFailed,
    #[error("native camera failed")]
    CameraFailed,
    #[error("native screen share failed")]
    ScreenShareFailed,
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut error = serializer.serialize_struct("Error", 2)?;
        error.serialize_field("code", self.code())?;
        error.serialize_field("message", self.message())?;
        error.end()
    }
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Busy => "busy",
            Self::ConnectFailed => "connect_failed",
            Self::StaleConnection => "stale_connection",
            Self::CloseFailed => "close_failed",
            Self::ActorUnavailable => "actor_unavailable",
            Self::AudioFailed => "audio_failed",
            Self::VideoFailed => "video_failed",
            Self::CameraFailed => "camera_failed",
            Self::ScreenShareFailed => "screen_share_failed",
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            Self::Busy => "another call is active",
            Self::ConnectFailed => "call connection failed",
            Self::StaleConnection => "connection ID does not match active call",
            Self::CloseFailed => "call shutdown failed",
            Self::ActorUnavailable => "call lifecycle unavailable",
            Self::AudioFailed => "native audio failed",
            Self::VideoFailed => "native video failed",
            Self::CameraFailed => "native camera failed",
            Self::ScreenShareFailed => "native screen share failed",
        }
    }
}
