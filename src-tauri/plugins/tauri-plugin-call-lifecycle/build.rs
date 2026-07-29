const COMMANDS: &[&str] = &[
    "connect",
    "disconnect",
    "set_media_enabled",
    "get_state",
    "getPlatformCallCapabilities",
    "startPlatformCallLifecycle",
    "stopPlatformCallLifecycle",
    "getPlatformCallState",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
