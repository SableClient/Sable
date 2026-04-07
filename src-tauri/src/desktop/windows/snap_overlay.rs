use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};

#[tauri::command]
pub async fn show_snap_overlay() {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();

    enigo.key(Key::Meta, Press).unwrap();
    enigo.key(Key::Unicode('z'), Click).unwrap();
    enigo.key(Key::Meta, Release).unwrap();

    std::thread::sleep(std::time::Duration::from_millis(100));

    enigo.key(Key::Alt, Click).unwrap();
}

#[tauri::command]
pub async fn hide_snap_overlay() {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    enigo.key(Key::Escape, Click).unwrap();
}
