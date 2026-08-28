//! Unread dot for the Linux system tray icon. Linux trays have no native
//! badge API and the CEF webview never exposes the web Badging API, so the
//! unread indicator is painted onto the icon bitmap and swapped in via
//! `TrayIcon::set_icon`.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::image::Image;
use tauri::AppHandle;

use crate::desktop::tray::MAIN_TRAY_ID;

static BADGE_SHOWN: AtomicBool = AtomicBool::new(false);

/// Clears the tracked dot state after the tray icon is (re)built.
pub fn reset_badge_state() {
    BADGE_SHOWN.store(false, Ordering::Relaxed);
}

fn render_badged_icon(base: &Image<'_>) -> Image<'static> {
    let width = base.width();
    let height = base.height();
    let mut rgba = base.rgba().to_vec();

    if width == 0 || height == 0 {
        return Image::new_owned(rgba, width, height);
    }

    let w = width as f32;
    let h = height as f32;

    let diameter = w.min(h) * 0.4;
    let radius = diameter / 2.0;
    let cx = w - radius - w * 0.04;
    let cy = h - radius - h * 0.04;

    let red: [f32; 3] = [0.878, 0.176, 0.176];

    let x0 = (cx - radius - 1.0).floor().max(0.0) as u32;
    let y0 = (cy - radius - 1.0).floor().max(0.0) as u32;
    let x1 = ((cx + radius + 1.0).ceil() as u32).min(width);
    let y1 = ((cy + radius + 1.0).ceil() as u32).min(height);

    for py in y0..y1 {
        for px in x0..x1 {
            let dx = px as f32 + 0.5 - cx;
            let dy = py as f32 + 0.5 - cy;
            let dist = (dx * dx + dy * dy).sqrt();

            // Hard edge: antialiased pixels turn into a visible ring once the
            // tray premultiplies the pixmap, so keep every dot pixel opaque.
            if dist > radius {
                continue;
            }

            let idx = ((py * width + px) * 4) as usize;
            rgba[idx] = (red[0] * 255.0).round() as u8;
            rgba[idx + 1] = (red[1] * 255.0).round() as u8;
            rgba[idx + 2] = (red[2] * 255.0).round() as u8;
            rgba[idx + 3] = 255;
        }
    }

    Image::new_owned(rgba, width, height)
}

/// Redraws the tray icon with or without the unread dot. `count` of `None` or
/// `Some(0)` restores the plain icon.
pub fn apply_tray_badge(app: &AppHandle<crate::BrowserEngine>, count: Option<u32>) {
    let want_dot = matches!(count, Some(count) if count > 0);

    // Swapping the pixmap makes the icon blink, so only touch it on a change.
    if BADGE_SHOWN.swap(want_dot, Ordering::Relaxed) == want_dot {
        return;
    }

    let Some(tray) = app.tray_by_id(MAIN_TRAY_ID) else {
        BADGE_SHOWN.store(false, Ordering::Relaxed);
        return;
    };
    let Some(base) = app.default_window_icon() else {
        BADGE_SHOWN.store(false, Ordering::Relaxed);
        return;
    };

    let result = if want_dot {
        tray.set_icon(Some(render_badged_icon(base)))
    } else {
        tray.set_icon(Some(base.to_owned()))
    };

    if let Err(error) = result {
        log::warn!("Failed to update tray badge: {error}");
        BADGE_SHOWN.store(false, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn set_tray_badge(
    app: AppHandle<crate::BrowserEngine>,
    count: Option<u32>,
) -> Result<(), String> {
    apply_tray_badge(&app, count);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_modifies_bottom_right_pixels() {
        let width = 32;
        let height = 32;
        let base = Image::new_owned(vec![0u8; (width * height * 4) as usize], width, height);
        let out = render_badged_icon(&base);
        let idx = (((height - 7) * width + (width - 7)) * 4) as usize;
        assert!(out.rgba()[idx + 3] > 0);
        assert_eq!(&out.rgba()[0..4], &[0, 0, 0, 0]);
    }

    #[test]
    fn dimensions_are_preserved() {
        let base = Image::new_owned([10u8, 20, 30, 255].repeat(16), 4, 4);
        let out = render_badged_icon(&base);
        assert_eq!((out.width(), out.height()), (4, 4));
    }
}
