fn main() {
    println!("cargo:rustc-env=TS_RS_EXPORT_DIR=../src/app/generated/tauri");

    tauri_typegen::BuildSystem::generate_at_build_time()
        .expect("Failed to generate TypeScript bindings");

    tauri_build::build()
}
