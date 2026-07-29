use serde::{ser::SerializeStruct, ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("call lifecycle actor unavailable")]
    ActorUnavailable,
    #[error("platform call lifecycle is not supported on this platform")]
    PlatformCallUnsupported,
    #[error("platform call lifecycle is already active")]
    PlatformCallBusy,
    #[error("platform call session does not match the active session")]
    PlatformCallStaleSession,
    #[error("platform call lifecycle failed to start")]
    PlatformCallStartFailed,
    #[error("platform call lifecycle failed to stop")]
    PlatformCallStopFailed,
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
            Self::ActorUnavailable => "actor_unavailable",
            Self::PlatformCallUnsupported => "platform_call_unsupported",
            Self::PlatformCallBusy => "platform_call_busy",
            Self::PlatformCallStaleSession => "platform_call_stale_session",
            Self::PlatformCallStartFailed => "platform_call_start_failed",
            Self::PlatformCallStopFailed => "platform_call_stop_failed",
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            Self::ActorUnavailable => "call lifecycle unavailable",
            Self::PlatformCallUnsupported => {
                "platform call lifecycle is not supported on this platform"
            }
            Self::PlatformCallBusy => "platform call lifecycle is already active",
            Self::PlatformCallStaleSession => {
                "platform call session does not match the active session"
            }
            Self::PlatformCallStartFailed => "platform call lifecycle failed to start",
            Self::PlatformCallStopFailed => "platform call lifecycle failed to stop",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_errors_have_stable_sanitized_shapes() {
        let error = serde_json::to_value(Error::PlatformCallStaleSession).unwrap();
        assert_eq!(
            error,
            serde_json::json!({
                "code": "platform_call_stale_session",
                "message": "platform call session does not match the active session"
            })
        );
        assert_eq!(
            Error::PlatformCallUnsupported.code(),
            "platform_call_unsupported"
        );
        assert_eq!(Error::PlatformCallBusy.code(), "platform_call_busy");
        assert_eq!(
            Error::PlatformCallStartFailed.message(),
            "platform call lifecycle failed to start"
        );
        assert_eq!(
            Error::PlatformCallStopFailed.code(),
            "platform_call_stop_failed"
        );
    }
}
