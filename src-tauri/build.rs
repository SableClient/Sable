fn main() {
    tauri_typegen::BuildSystem::generate_at_build_time()
        .expect("Failed to generate TypeScript bindings");

    tauri_build::build()
}
