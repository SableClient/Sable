use secrecy::SecretString;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub connection_id: String,
    pub server_url: String,
    pub participant_token: SecretString,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectRequest {
    pub connection_id: String,
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallLifecycleError {
    pub revision: u64,
    pub code: &'static str,
    pub message: &'static str,
    pub connection_id: Option<String>,
}
