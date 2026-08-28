use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "desktop/", rename_all = "camelCase")]
pub struct DesktopRuntimeState {
    pub tray_available: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use ts_rs::{Config, TS};

    #[test]
    fn desktop_runtime_state_serializes_with_camel_case_keys() {
        let state = DesktopRuntimeState {
            tray_available: true,
        };

        assert_eq!(
            serde_json::to_value(state).unwrap(),
            json!({
                "trayAvailable": true,
            })
        );
    }

    #[test]
    fn desktop_runtime_state_exports_to_typescript() {
        let output = DesktopRuntimeState::export_to_string(&Config::new()).unwrap();

        assert!(output.contains("type DesktopRuntimeState"));
        assert!(output.contains("trayAvailable: boolean"));
    }
}
