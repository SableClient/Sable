fn main() {
    println!("cargo:rustc-env=TS_RS_EXPORT_DIR=../src/app/generated/tauri");

    // Find libcef.so next to the binary (CEF ships it there).
    if std::env::var_os("CARGO_FEATURE_CEF").is_some()
        && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
    {
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,$ORIGIN");
    }

    // The notifications plugin links the Swift runtime via @rpath.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,/usr/lib/swift");
    }

    // Use the NDK's lld linker for faster Android linking.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-fuse-ld=lld");
    }

    tauri_typegen::BuildSystem::generate_at_build_time()
        .expect("Failed to generate TypeScript bindings");

    // tauri-build fails on permissions from missing plugins, so only glob the
    // updater capability file when the `updater` feature is on.
    #[cfg(feature = "updater")]
    let tauri_attrs =
        tauri_build::Attributes::new().capabilities_path_pattern("./capabilities/**/*.json");
    #[cfg(not(feature = "updater"))]
    let tauri_attrs =
        tauri_build::Attributes::new().capabilities_path_pattern("./capabilities/*.json");

    tauri_build::try_build(tauri_attrs).expect("tauri-build failed");
}
