use serde::Deserialize;

#[derive(Deserialize)]
pub struct NotifyOptions {
    pub title: String,
    pub body: Option<String>,
}

/// Detect whether we're running from an installed location that has a
/// registered AUMID (via Start Menu shortcut created by the installer).
///
/// Checks for:
/// - NSIS uninstaller next to the binary
/// - Exe path inside standard install directories (LocalAppData, ProgramFiles)
///
/// If none match, we're portable/dev and native toasts won't work.
#[cfg(windows)]
pub fn is_installed() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };

    // NSIS installs leave an uninstall.exe next to the binary
    if let Some(dir) = exe.parent() {
        if dir.join("uninstall.exe").exists() {
            return true;
        }
    }

    // Check if the exe is in a standard Windows install directory
    let exe_lower = exe.display().to_string().to_lowercase();

    if let Ok(val) = std::env::var("LOCALAPPDATA") {
        if exe_lower.starts_with(&val.to_lowercase()) {
            return true;
        }
    }
    if let Ok(val) = std::env::var("PROGRAMFILES") {
        if exe_lower.starts_with(&val.to_lowercase()) {
            return true;
        }
    }
    if let Ok(val) = std::env::var("ProgramFiles(x86)") {
        if exe_lower.starts_with(&val.to_lowercase()) {
            return true;
        }
    }

    false
}

/// Show a notification using the native Tauri plugin (for installed builds).
#[cfg(windows)]
fn show_toast_native(app: &tauri::AppHandle, opts: &NotifyOptions) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let mut builder = app.notification().builder().title(&opts.title);
    if let Some(body) = &opts.body {
        builder = builder.body(body);
    }
    builder
        .show()
        .map_err(|e| format!("Failed to show notification: {e}"))
}

/// Show a native Windows toast via hidden PowerShell (for portable/dev builds).
#[cfg(windows)]
fn show_toast_powershell(opts: &NotifyOptions) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let title = opts
        .title
        .replace('\'', "''")
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let body = opts
        .body
        .as_deref()
        .unwrap_or("")
        .replace('\'', "''")
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");

    let script = format!(
        r#"
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null

$template = @'
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>{title}</text>
      <text>{body}</text>
    </binding>
  </visual>
</toast>
'@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\WindowsPowerShell\v1.0\powershell.exe').Show($toast)
"#,
        title = title,
        body = body,
    );

    Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to show notification: {e}"))?;

    Ok(())
}

/// Route to the appropriate notification backend based on install type.
/// Installed builds use the native Tauri notification plugin (shows as "Sable").
/// Portable/dev builds fall back to hidden PowerShell toasts.
#[cfg(windows)]
pub fn show_toast(app: &tauri::AppHandle, opts: &NotifyOptions) -> Result<(), String> {
    if is_installed() {
        show_toast_native(app, opts)
    } else {
        show_toast_powershell(opts)
    }
}
