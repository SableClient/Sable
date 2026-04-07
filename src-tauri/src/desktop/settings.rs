use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "desktop/", rename_all = "camelCase")]
pub struct DesktopSettings {
    pub close_to_background_on_close: bool,
    pub show_system_tray_icon: bool,
}

pub(crate) const DESKTOP_SETTINGS_PATH: &str = "desktop-preferences.json";
pub(crate) const CLOSE_TO_BACKGROUND_ON_CLOSE_KEY: &str = "closeToBackgroundOnClose";
pub(crate) const SHOW_SYSTEM_TRAY_ICON_KEY: &str = "showSystemTrayIcon";
pub(crate) const LEGACY_KEEP_BACKGROUND_RUNNING_KEY: &str = "keepBackgroundRunning";

pub(crate) fn tray_available_for_session(settings: DesktopSettings, tray_created: bool) -> bool {
    settings.show_system_tray_icon && tray_created
}

pub(crate) fn desktop_settings_from_values(
    close_to_background_on_close: Option<bool>,
    show_system_tray_icon: Option<bool>,
    keep_background_running: Option<bool>,
) -> DesktopSettings {
    DesktopSettings {
        close_to_background_on_close: close_to_background_on_close.unwrap_or(true)
            || keep_background_running.unwrap_or(false),
        show_system_tray_icon: show_system_tray_icon.unwrap_or(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use ts_rs::{Config, TS};

    #[test]
    fn desktop_settings_serialize_with_camel_case_keys() {
        let settings = DesktopSettings {
            close_to_background_on_close: true,
            show_system_tray_icon: false,
        };

        assert_eq!(
            serde_json::to_value(settings).unwrap(),
            json!({
                "closeToBackgroundOnClose": true,
                "showSystemTrayIcon": false,
            })
        );
    }

    #[test]
    fn desktop_settings_deserialize_from_camel_case_keys() {
        assert_eq!(
            serde_json::from_value::<DesktopSettings>(json!({
                "closeToBackgroundOnClose": true,
                "showSystemTrayIcon": false,
            }))
            .unwrap(),
            DesktopSettings {
                close_to_background_on_close: true,
                show_system_tray_icon: false,
            }
        );
    }

    #[test]
    fn desktop_settings_export_to_typescript_with_camel_case_keys() {
        let output = DesktopSettings::export_to_string(&Config::new()).unwrap();

        assert!(output.contains("type DesktopSettings"));
        assert!(output.contains("closeToBackgroundOnClose: boolean"));
        assert!(output.contains("showSystemTrayIcon: boolean"));
        assert!(!output.contains("keepBackgroundRunning: boolean"));
    }

    #[test]
    fn legacy_background_setting_keeps_close_behavior_enabled() {
        assert_eq!(
            desktop_settings_from_values(Some(false), Some(false), Some(true)),
            DesktopSettings {
                close_to_background_on_close: true,
                show_system_tray_icon: false,
            }
        );
    }

    #[test]
    fn explicit_close_setting_stays_disabled_when_legacy_background_is_off() {
        assert_eq!(
            desktop_settings_from_values(Some(false), Some(true), Some(false)),
            DesktopSettings {
                close_to_background_on_close: false,
                show_system_tray_icon: true,
            }
        );
    }
}
