//! Decrypting a push payload with no webview.
//!
//! A cold push starts the process for the delivery service alone, so there is no Tauri
//! command to invoke; the notifications plugin calls this symbol directly.

use jni::objects::{JClass, JString};
use jni::{Env, EnvUnowned};

use super::push::decrypt_push;

/// The clear event as JSON, or an empty string when it cannot be decrypted. The symbol
/// name must match `PushPayloadDecryptor.nativeDecryptPush`, package included.
#[unsafe(no_mangle)]
pub extern "system" fn Java_app_tauri_notification_PushPayloadDecryptor_nativeDecryptPush<
    'frame,
>(
    mut unowned_env: EnvUnowned<'frame>,
    _class: JClass<'frame>,
    store_dir: JString<'frame>,
    user_id: JString<'frame>,
    device_id: JString<'frame>,
    room_id: JString<'frame>,
    event_json: JString<'frame>,
) -> JString<'frame> {
    let outcome = unowned_env.with_env(|env: &mut Env<'frame>| -> Result<_, jni::errors::Error> {
        let dir = store_dir.to_string();
        let user = user_id.to_string();
        let device = device_id.to_string();
        let room = room_id.to_string();
        let event = event_json.to_string();

        // The delivery service has no runtime of its own.
        let clear = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .ok()
            .and_then(|runtime| {
                let store = std::path::Path::new(&dir).join(super::store_subpath(&user, &device));
                runtime
                    .block_on(decrypt_push(&store, None, &user, &device, &room, &event))
                    .ok()
            })
            .map(|decrypted| decrypted.clear_event)
            .unwrap_or_default();

        JString::from_str(env, clear)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}
