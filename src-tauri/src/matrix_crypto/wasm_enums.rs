//! The numeric values matrix-sdk-crypto-wasm's enums cross the IPC boundary as.

use matrix_sdk_crypto::types::EventEncryptionAlgorithm;

/// wasm's `RequestType`.
pub mod request_type {
    pub const KEYS_UPLOAD: u8 = 0;
    pub const KEYS_QUERY: u8 = 1;
    pub const KEYS_CLAIM: u8 = 2;
    pub const TO_DEVICE: u8 = 3;
    pub const SIGNATURE_UPLOAD: u8 = 4;
    pub const ROOM_MESSAGE: u8 = 5;
    pub const KEYS_BACKUP: u8 = 6;
}

/// wasm's `EncryptionAlgorithm`; anything the bindings do not name maps to `Unknown`.
pub fn encryption_algorithm(algorithm: &EventEncryptionAlgorithm) -> u8 {
    match algorithm {
        EventEncryptionAlgorithm::OlmV1Curve25519AesSha2 => 0,
        EventEncryptionAlgorithm::MegolmV1AesSha2 => 1,
        _ => 2,
    }
}
