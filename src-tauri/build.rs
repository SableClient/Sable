fn main() {
    println!("cargo:rustc-env=TS_RS_EXPORT_DIR=../src/app/generated/tauri");

    if let Ok(dsn) = std::env::var("VITE_SENTRY_DSN") {
        println!("cargo:rustc-env=SENTRY_DSN={dsn}");
    }
    if let Ok(env) = std::env::var("VITE_SENTRY_ENVIRONMENT") {
        println!("cargo:rustc-env=SENTRY_ENVIRONMENT={env}");
    }
    if let Ok(version) = std::env::var("VITE_APP_VERSION") {
        println!("cargo:rustc-env=SENTRY_APP_VERSION={version}");
    }
    println!("cargo:rerun-if-env-changed=VITE_SENTRY_DSN");
    println!("cargo:rerun-if-env-changed=VITE_SENTRY_ENVIRONMENT");
    println!("cargo:rerun-if-env-changed=VITE_APP_VERSION");

    let config_path = std::path::Path::new("../config.json");
    let base = std::fs::read_to_string(config_path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|config| {
            config
                .get("productName")
                .and_then(|v| v.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| "Sable".into());

    let full_name = if matches!(
        std::env::var("SABLE_BUILD_FLAVOR").ok().as_deref(),
        Some("dev" | "nightly")
    ) {
        format!("{} Nightly", base)
    } else {
        base.clone()
    };

    println!("cargo:rustc-env=SABLE_PRODUCT_NAME={}", base);
    println!(
        "cargo:rustc-env=TAURI_CONFIG={{\"productName\":\"{}\"}}",
        full_name
    );
    println!("cargo:rerun-if-env-changed=SABLE_BUILD_FLAVOR");
    // Find libcef.so next to the binary (CEF ships it there).
    if std::env::var_os("CARGO_FEATURE_CEF").is_some()
        && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
    {
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,$ORIGIN");
    }

    // Bundled WebKitGTK in webkit/, staged tray libs beside the binary. Falls
    // through to the system copies when absent.
    if std::env::var_os("CARGO_FEATURE_WRY").is_some()
        && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux")
    {
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,$ORIGIN:$ORIGIN/webkit");
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
