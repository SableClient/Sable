use tauri::AppHandle;
use tauri_plugin_log::{Builder, FileOpenStrategy, RotationStrategy, Target, TargetKind};

const MAX_LOG_FILE_SIZE: u128 = 5 * 1024 * 1024;
const ROTATED_LOG_COUNT: usize = 5;

fn is_reviewed_verbose_target(target: &str) -> bool {
    target == "app_lib"
        || target.starts_with("app_lib::")
        || target == "sable"
        || target.starts_with("sable::")
        || target == "tauri"
        || target.starts_with("tauri::")
        || target.starts_with("tauri_runtime_")
        || target.starts_with("tauri_plugin_")
        || target == tauri_plugin_log::WEBVIEW_TARGET
}

fn file_log_record_allowed(metadata: &log::Metadata) -> bool {
    metadata.level() <= log::Level::Warn || is_reviewed_verbose_target(metadata.target())
}

fn builder() -> Builder {
    Builder::default()
        .level(log::LevelFilter::Info)
        .max_file_size(MAX_LOG_FILE_SIZE)
        .rotation_strategy(RotationStrategy::KeepSome(ROTATED_LOG_COUNT))
        .file_open_strategy(FileOpenStrategy::Append)
        .clear_targets()
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::LogDir { file_name: None }).filter(file_log_record_allowed))
}

pub fn setup(app: &AppHandle<crate::BrowserEngine>) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(all(debug_assertions, feature = "devtools"))]
    {
        let (log_plugin, _level, logger) = builder().split(app)?;
        let mut devtools = tauri_plugin_devtools::Builder::default();
        devtools.attach_logger(logger);
        app.plugin(devtools.init())?;
        app.plugin(log_plugin)?;
    }

    #[cfg(not(all(debug_assertions, feature = "devtools")))]
    app.plugin(builder().build())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{file_log_record_allowed, is_reviewed_verbose_target};

    fn allowed(target: &str, level: log::Level) -> bool {
        let metadata = log::Metadata::builder().target(target).level(level).build();
        file_log_record_allowed(&metadata)
    }

    #[test]
    fn reviewed_targets_keep_verbose_levels() {
        for target in [
            "app_lib",
            "app_lib::desktop::diagnostics",
            "app_lib::network::loopback_http",
            "sable",
            "tauri",
            "tauri::manager",
            "tauri_runtime_cef",
            "tauri_runtime_cef::cef_impl::ipc",
            "tauri_runtime_wry",
            "tauri_plugin_updater",
            "tauri_plugin_window_state",
            tauri_plugin_log::WEBVIEW_TARGET,
        ] {
            assert!(is_reviewed_verbose_target(target), "expected {target}");
            for level in [log::Level::Info, log::Level::Debug, log::Level::Trace] {
                assert!(allowed(target, level), "{level} from {target} dropped");
            }
        }
    }

    #[test]
    fn noisy_dependency_targets_are_suppressed_below_warn() {
        for target in [
            "reqwest",
            "reqwest::connect",
            "hyper::client::pool",
            "rustls::client",
            "tokio",
            "mio",
            "tracing",
            "cef",
            "tao",
            "wry",
            "webkit2gtk",
            "soup3",
            "taurine", // similar-looking prefixes must not match
            "sablefish::module",
        ] {
            for level in [log::Level::Info, log::Level::Debug, log::Level::Trace] {
                assert!(!allowed(target, level), "{level} from {target} kept");
            }
        }
    }

    #[test]
    fn dependency_warnings_and_errors_are_kept() {
        for target in ["reqwest", "hyper::client", "rustls", "cef", "unknown_crate"] {
            assert!(allowed(target, log::Level::Warn), "{target} warn dropped");
            assert!(allowed(target, log::Level::Error), "{target} error dropped");
        }
    }
}
