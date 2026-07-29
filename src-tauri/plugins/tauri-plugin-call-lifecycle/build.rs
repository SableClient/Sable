const COMMANDS: &[&str] = &[
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
