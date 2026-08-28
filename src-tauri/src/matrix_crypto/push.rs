//! Decryption for push notifications, reachable without a webview or an `AppHandle`.

use std::path::Path;
use std::sync::Arc;

use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::RoomId;
use matrix_sdk_crypto::types::events::room::encrypted::EncryptedEvent;
use matrix_sdk_crypto::OlmMachine;
use serde_json::Value;
use tokio::sync::Mutex as AsyncMutex;

use super::args::decryption_settings;
use super::{account_key, engines, open_machine};

/// Serialises open-if-absent. Two pushes racing here would otherwise build two
/// `OlmMachine`s over one sqlite store, which wedges Olm sessions.
static OPEN_GUARD: AsyncMutex<()> = AsyncMutex::const_new(());

/// Returns the machine already registered for the account, opening one if the process is
/// cold, and reports whether this call is what opened the store. Never evicts a machine
/// the webview is using; only the opener may close it again — see [`release_after_push`].
pub async fn open_machine_for_push(
    dir: &Path,
    passphrase: Option<&str>,
    user_id: &str,
    device_id: &str,
) -> Result<(Arc<OlmMachine>, bool), String> {
    if let Ok(machine) = engines().machine(user_id, device_id) {
        return Ok((machine, false));
    }

    let _guard = OPEN_GUARD.lock().await;
    // Another push may have opened it while we waited for the guard.
    if let Ok(machine) = engines().machine(user_id, device_id) {
        return Ok((machine, false));
    }

    let (machine, _) = open_machine(dir, passphrase, user_id, device_id).await?;
    Ok((machine, true))
}

/// The decrypted event plus the fields a notification needs to render.
#[derive(Debug, serde::Serialize)]
pub struct DecryptedPush {
    pub event_type: Option<String>,
    pub sender: Option<String>,
    pub body: Option<String>,
    /// JSON text: the TypeScript generator has no mapping for `serde_json::Value`.
    pub clear_event: String,
}

/// Decrypts one encrypted room event fetched for a push.
pub async fn decrypt_push_event(
    machine: &OlmMachine,
    room_id: &str,
    event_json: &str,
) -> Result<DecryptedPush, String> {
    let room = RoomId::parse(room_id).map_err(|e| format!("bad room id `{room_id}`: {e}"))?;
    let event: Raw<EncryptedEvent> =
        serde_json::from_str(event_json).map_err(|e| format!("bad event json: {e}"))?;

    let decrypted = machine
        .decrypt_room_event(&event, &room, &decryption_settings())
        .await
        .map_err(|e| format!("decrypting push event failed: {e:?}"))?;

    let clear_event: Value = serde_json::from_str(decrypted.event.json().get())
        .map_err(|e| format!("bad clear event json: {e}"))?;

    Ok(DecryptedPush {
        event_type: string_at(&clear_event, &["type"]),
        sender: string_at(&clear_event, &["sender"]),
        body: string_at(&clear_event, &["content", "body"]),
        clear_event: clear_event.to_string(),
    })
}

fn string_at(value: &Value, path: &[&str]) -> Option<String> {
    path.iter()
        .try_fold(value, |current, key| current.get(key))?
        .as_str()
        .map(str::to_owned)
}

/// Closes the machine this process opened for a push, leaving a webview-owned machine
/// alone. Callers on a cold path should release the store once the notification is shown.
pub fn release_after_push(user_id: &str, device_id: &str, was_cold: bool) -> Result<(), String> {
    if was_cold {
        engines().close_account(&account_key(user_id, device_id))?;
    }
    Ok(())
}

/// One-shot headless decrypt: opens the store if the process is cold, decrypts, then
/// releases whatever it opened. This is the entry point native push code uses when
/// there is no webview and no `AppHandle` to route through.
pub async fn decrypt_push(
    dir: &Path,
    passphrase: Option<&str>,
    user_id: &str,
    device_id: &str,
    room_id: &str,
    event_json: &str,
) -> Result<DecryptedPush, String> {
    let (machine, was_cold) = open_machine_for_push(dir, passphrase, user_id, device_id).await?;
    let decrypted = decrypt_push_event(&machine, room_id, event_json).await;

    // The registry holds the other reference; drop ours so the close actually frees it.
    drop(machine);
    release_after_push(user_id, device_id, was_cold)?;

    decrypted
}

/// Decrypts a push payload for the webview. The cold path cannot come through here:
/// with no webview alive there is nothing to invoke a command.
#[tauri::command]
pub async fn engine_decrypt_push(
    app: tauri::AppHandle<crate::BrowserEngine>,
    user_id: String,
    device_id: String,
    room_id: String,
    event_json: String,
    passphrase: Option<String>,
) -> Result<DecryptedPush, String> {
    let dir = super::store_dir(&app, &user_id, &device_id)?;
    decrypt_push(
        &dir,
        passphrase.as_deref(),
        &user_id,
        &device_id,
        &room_id,
        &event_json,
    )
    .await
}

#[cfg(test)]
mod tests {
    use matrix_sdk_sqlite::SqliteCryptoStore;
    use serde_json::json;

    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("sable-push-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn reuses_an_already_open_machine() {
        let dir = temp_dir("reuse");
        let (opened, _) = open_machine(&dir, None, "@push:example.org", "PUSHDEVICE")
            .await
            .unwrap();

        let (reused, was_cold) =
            open_machine_for_push(&dir, None, "@push:example.org", "PUSHDEVICE")
                .await
                .unwrap();
        assert!(!was_cold, "an already-open account must not report as cold");

        assert!(
            Arc::ptr_eq(&opened, &reused),
            "push must not build a second OlmMachine over the same store"
        );

        engines()
            .close_account(&account_key("@push:example.org", "PUSHDEVICE"))
            .unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn opens_a_machine_when_the_process_is_cold() {
        let dir = temp_dir("cold");
        let (machine, was_cold) =
            open_machine_for_push(&dir, None, "@cold:example.org", "COLDDEVICE")
                .await
                .unwrap();

        assert_eq!(machine.user_id().as_str(), "@cold:example.org");
        assert!(
            was_cold,
            "a cold process must report that it opened the store"
        );

        engines()
            .close_account(&account_key("@cold:example.org", "COLDDEVICE"))
            .unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn a_cold_one_shot_decrypt_releases_the_store_it_opened() {
        let dir = temp_dir("oneshot-cold");
        let event = json!({ "not": "an encrypted event" }).to_string();

        let result = decrypt_push(
            &dir,
            None,
            "@oneshot:example.org",
            "ONESHOTDEVICE",
            "!room:example.org",
            &event,
        )
        .await;

        assert!(result.is_err(), "a bogus event must not decrypt");
        assert!(
            engines()
                .machine("@oneshot:example.org", "ONESHOTDEVICE")
                .is_err(),
            "a cold decrypt must not leave the crypto store open"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn a_warm_one_shot_decrypt_leaves_the_webviews_machine_open() {
        let dir = temp_dir("oneshot-warm");
        let (_machine, _) = open_machine(&dir, None, "@warm:example.org", "WARMDEVICE")
            .await
            .unwrap();

        let event = json!({ "not": "an encrypted event" }).to_string();
        let _ = decrypt_push(
            &dir,
            None,
            "@warm:example.org",
            "WARMDEVICE",
            "!room:example.org",
            &event,
        )
        .await;

        assert!(
            engines().machine("@warm:example.org", "WARMDEVICE").is_ok(),
            "a push must never close a machine the webview owns"
        );

        engines()
            .close_account(&account_key("@warm:example.org", "WARMDEVICE"))
            .unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn reports_an_undecryptable_event_rather_than_panicking() {
        let dir = temp_dir("undecryptable");
        let store = SqliteCryptoStore::open(dir.join("crypto.sqlite3"), None)
            .await
            .unwrap();
        let user: &matrix_sdk::ruma::UserId = "@bad:example.org".try_into().unwrap();
        let machine = OlmMachine::with_store(user, "BADDEVICE".into(), Arc::new(store), None)
            .await
            .unwrap();

        let event = json!({
            "type": "m.room.encrypted",
            "event_id": "$bogus:example.org",
            "sender": "@someone:example.org",
            "origin_server_ts": 0,
            "room_id": "!room:example.org",
            "content": {
                "algorithm": "m.megolm.v1.aes-sha2",
                "ciphertext": "AAAAAAAA",
                "sender_key": "AAAA",
                "session_id": "AAAA",
                "device_id": "X",
            },
        })
        .to_string();

        let result = decrypt_push_event(&machine, "!room:example.org", &event).await;
        assert!(result.is_err(), "bogus megolm event must not decrypt");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
