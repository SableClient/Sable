use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};

fn new_enigo() -> Result<Enigo, String> {
    Enigo::new(&Settings::default()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn show_snap_overlay() -> Result<(), String> {
    let mut enigo = new_enigo()?;

    enigo
        .key(Key::Meta, Press)
        .map_err(|error| error.to_string())?;

    // Release Meta even if the chord fails, or it stays held for the session.
    let chord = enigo.key(Key::Unicode('z'), Click);
    let release = enigo.key(Key::Meta, Release);
    chord.map_err(|error| error.to_string())?;
    release.map_err(|error| error.to_string())?;

    std::thread::sleep(std::time::Duration::from_millis(100));

    enigo
        .key(Key::Alt, Click)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn hide_snap_overlay() -> Result<(), String> {
    let mut enigo = new_enigo()?;
    enigo
        .key(Key::Escape, Click)
        .map_err(|error| error.to_string())
}
