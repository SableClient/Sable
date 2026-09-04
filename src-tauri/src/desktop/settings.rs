use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "desktop/", rename_all = "camelCase")]
pub struct DesktopSettings {
    pub close_to_background_on_close: bool,
    pub show_system_tray_icon: bool,
    pub use_custom_title_bar: bool,
    pub spellcheck: bool,
}

pub(crate) const DESKTOP_SETTINGS_PATH: &str = "desktop-preferences.json";
pub(crate) const CLOSE_TO_BACKGROUND_ON_CLOSE_KEY: &str = "closeToBackgroundOnClose";
pub(crate) const SHOW_SYSTEM_TRAY_ICON_KEY: &str = "showSystemTrayIcon";
pub(crate) const USE_CUSTOM_TITLE_BAR_KEY: &str = "useCustomTitleBar";
pub(crate) const SPELLCHECK_KEY: &str = "spellcheck";
pub(crate) const TOGGLE_WINDOW_SHORTCUT_KEY: &str = "toggleWindowShortcut";
pub(crate) const LEGACY_KEEP_BACKGROUND_RUNNING_KEY: &str = "keepBackgroundRunning";

pub(crate) const fn use_custom_title_bar_default() -> bool {
    cfg!(target_os = "windows")
}

pub(crate) fn tray_available_for_session(settings: DesktopSettings, tray_created: bool) -> bool {
    settings.show_system_tray_icon && tray_created
}

pub(crate) fn desktop_settings_from_values(
    close_to_background_on_close: Option<bool>,
    show_system_tray_icon: Option<bool>,
    use_custom_title_bar: Option<bool>,
    spellcheck: Option<bool>,
    keep_background_running: Option<bool>,
) -> DesktopSettings {
    DesktopSettings {
        close_to_background_on_close: close_to_background_on_close.unwrap_or(true)
            || keep_background_running.unwrap_or(false),
        show_system_tray_icon: show_system_tray_icon.unwrap_or(true),
        use_custom_title_bar: use_custom_title_bar.unwrap_or(use_custom_title_bar_default()),
        spellcheck: spellcheck.unwrap_or(true),
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
            use_custom_title_bar: true,
            spellcheck: false,
        };

        assert_eq!(
            serde_json::to_value(settings).unwrap(),
            json!({
                "closeToBackgroundOnClose": true,
                "showSystemTrayIcon": false,
                "useCustomTitleBar": true,
                "spellcheck": false,
            })
        );
    }

    #[test]
    fn desktop_settings_deserialize_from_camel_case_keys() {
        assert_eq!(
            serde_json::from_value::<DesktopSettings>(json!({
                "closeToBackgroundOnClose": true,
                "showSystemTrayIcon": false,
                "useCustomTitleBar": true,
                "spellcheck": false,
            }))
            .unwrap(),
            DesktopSettings {
                close_to_background_on_close: true,
                show_system_tray_icon: false,
                use_custom_title_bar: true,
                spellcheck: false,
            }
        );
    }

    #[test]
    fn desktop_settings_export_to_typescript_with_camel_case_keys() {
        let output = DesktopSettings::export_to_string(&Config::new()).unwrap();

        assert!(output.contains("type DesktopSettings"));
        assert!(output.contains("closeToBackgroundOnClose: boolean"));
        assert!(output.contains("showSystemTrayIcon: boolean"));
        assert!(output.contains("useCustomTitleBar: boolean"));
        assert!(output.contains("spellcheck: boolean"));
        assert!(!output.contains("keepBackgroundRunning: boolean"));
    }

    #[test]
    fn legacy_background_setting_keeps_close_behavior_enabled() {
        assert_eq!(
            desktop_settings_from_values(Some(false), Some(false), Some(false), None, Some(true)),
            DesktopSettings {
                close_to_background_on_close: true,
                show_system_tray_icon: false,
                use_custom_title_bar: false,
                spellcheck: true,
            }
        );
    }

    #[test]
    fn explicit_close_setting_stays_disabled_when_legacy_background_is_off() {
        assert_eq!(
            desktop_settings_from_values(Some(false), Some(true), Some(true), None, Some(false)),
            DesktopSettings {
                close_to_background_on_close: false,
                show_system_tray_icon: true,
                use_custom_title_bar: true,
                spellcheck: true,
            }
        );
    }

    #[test]
    fn missing_custom_title_bar_setting_uses_platform_default() {
        assert_eq!(
            desktop_settings_from_values(Some(true), Some(true), None, None, None)
                .use_custom_title_bar,
            cfg!(target_os = "windows")
        );
    }

    #[test]
    fn missing_spellcheck_setting_defaults_to_enabled() {
        assert!(desktop_settings_from_values(None, None, None, None, None).spellcheck);
        assert!(!desktop_settings_from_values(None, None, None, Some(false), None).spellcheck);
    }
}
