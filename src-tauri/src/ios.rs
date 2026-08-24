// iOS shows a form accessory bar (prev/next arrows + Done) above the keyboard
// for web inputs. WKWebView exposes no API to disable it, so swap the private
// WKContentView's class for a runtime subclass whose inputAccessoryView is nil,
// the same approach as Capacitor's hideFormAccessoryBar.

use std::ffi::CString;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use objc2::rc::{Allocated, Retained};
use objc2::runtime::{
    AnyClass, AnyObject, ClassBuilder, NSObject, NSObjectProtocol, ProtocolObject, Sel,
};
use objc2::{define_class, msg_send, sel, AnyThread};
use objc2_avf_audio::AVAudioSession;
use objc2_call_kit::{
    CXCallController, CXEndCallAction, CXHandle, CXHandleType, CXProvider, CXProviderConfiguration,
    CXProviderDelegate, CXStartCallAction,
};
use objc2_foundation::{NSString, NSUUID};
use tauri::webview::WebviewWindow;

extern "C-unwind" fn input_accessory_view_nil(_this: &AnyObject, _cmd: Sel) -> *mut AnyObject {
    std::ptr::null_mut()
}

// Edge-swipe back, matching Android's system back gesture. wry leaves
// allowsBackForwardNavigationGestures off; react-router entries are
// same-document navigations, which WKWebView tracks in its back-forward list.
pub fn enable_swipe_back_navigation(window: &WebviewWindow<crate::BrowserEngine>) {
    let _ = window.with_webview(|webview| unsafe {
        let webview: *mut AnyObject = webview.inner().cast();
        let _: () = msg_send![&*webview, setAllowsBackForwardNavigationGestures: true];
    });
}

// UIFeedbackGenerator must run on the main thread, where Tauri schedules mobile
// commands.
#[tauri::command]
pub fn haptic_feedback(style: String) {
    unsafe {
        if style == "selection" {
            let Some(cls) = AnyClass::get(c"UISelectionFeedbackGenerator") else {
                return;
            };
            let allocated: Allocated<AnyObject> = msg_send![cls, alloc];
            let generator: Retained<AnyObject> = msg_send![allocated, init];
            let _: () = msg_send![&*generator, prepare];
            let _: () = msg_send![&*generator, selectionChanged];
        } else {
            // UIImpactFeedbackStyle: light = 0, medium = 1, heavy = 2.
            let intensity: isize = match style.as_str() {
                "medium" => 1,
                "heavy" => 2,
                _ => 0,
            };
            let Some(cls) = AnyClass::get(c"UIImpactFeedbackGenerator") else {
                return;
            };
            let allocated: Allocated<AnyObject> = msg_send![cls, alloc];
            let generator: Retained<AnyObject> = msg_send![allocated, initWithStyle: intensity];
            let _: () = msg_send![&*generator, prepare];
            let _: () = msg_send![&*generator, impactOccurred];
        }
    }
}

#[tauri::command]
pub fn activate_call_audio_session() -> Result<(), String> {
    callkit::start_call()
}

#[tauri::command]
pub fn deactivate_call_audio_session() -> Result<(), String> {
    callkit::end_call()
}

// CallKit owns the audio session and keeps the process alive in the
// background via the `voip` UIBackgroundMode (Apple rejects `voip` without it).

use std::cell::RefCell;

thread_local! {
    static CALLKIT: RefCell<CallKitState> = RefCell::new(CallKitState::default());
}

#[derive(Default)]
struct CallKitState {
    provider: Option<Retained<CXProvider>>,
    controller: Option<Retained<CXCallController>>,
    uuid: Option<Retained<NSUUID>>,
}

// Minimal CXProviderDelegate: calls are controlled from Sable's UI, so the
// perform* methods just fulfill.
define_class!(
    #[unsafe(super(NSObject))]
    #[name = "SableCallKitDelegate"]
    struct SableCallKitDelegate;

    unsafe impl NSObjectProtocol for SableCallKitDelegate {}

    unsafe impl CXProviderDelegate for SableCallKitDelegate {
        #[unsafe(method(providerDidReset:))]
        fn providerDidReset(&self, _provider: &CXProvider) {
            CALLKIT.with(|s| s.borrow_mut().uuid = None);
        }

        #[unsafe(method(provider:didActivateAudioSession:))]
        fn provider_didActivateAudioSession(
            &self,
            _provider: &CXProvider,
            _session: &AVAudioSession,
        ) {
        }

        #[unsafe(method(provider:didDeactivateAudioSession:))]
        fn provider_didDeactivateAudioSession(
            &self,
            _provider: &CXProvider,
            _session: &AVAudioSession,
        ) {
        }

        #[unsafe(method(provider:performStartCallAction:))]
        fn provider_performStartCallAction(
            &self,
            _provider: &CXProvider,
            action: &CXStartCallAction,
        ) {
            unsafe { action.fulfill() };
        }

        #[unsafe(method(provider:performEndCallAction:))]
        fn provider_performEndCallAction(&self, _provider: &CXProvider, action: &CXEndCallAction) {
            unsafe { action.fulfill() };
        }
    }
);

mod callkit {
    use super::*;

    fn ensure_provider() -> Result<(), String> {
        CALLKIT.with(|s| -> Result<(), String> {
            let mut s = s.borrow_mut();
            if s.provider.is_some() && s.controller.is_some() {
                return Ok(());
            }

            let config = unsafe {
                let allocated = CXProviderConfiguration::alloc();
                let cfg = CXProviderConfiguration::init(allocated);
                cfg.setSupportsVideo(true);
                cfg.setMaximumCallsPerCallGroup(1);
                cfg.setMaximumCallGroups(1);
                cfg.setIncludesCallsInRecents(true);
                cfg
            };

            let delegate = {
                let allocated = SableCallKitDelegate::alloc();
                let delegate: Retained<SableCallKitDelegate> =
                    unsafe { msg_send![allocated, init] };
                ProtocolObject::from_retained(delegate)
            };

            let provider = unsafe {
                let allocated = CXProvider::alloc();
                CXProvider::initWithConfiguration(allocated, &config)
            };
            unsafe { provider.setDelegate_queue(Some(&delegate), None) };

            let controller = unsafe {
                let allocated = CXCallController::alloc();
                CXCallController::init(allocated)
            };

            s.provider = Some(provider);
            s.controller = Some(controller);
            Ok(())
        })
    }

    pub fn start_call() -> Result<(), String> {
        ensure_provider()?;

        CALLKIT.with(|s| -> Result<(), String> {
            let mut s = s.borrow_mut();

            if s.uuid.is_none() {
                s.uuid = Some(NSUUID::from_bytes(random_uuid_bytes()));
            }
            let uuid = s.uuid.as_ref().unwrap().clone();
            let controller = s.controller.as_ref().unwrap().clone();

            let handle = unsafe {
                let allocated = CXHandle::alloc();
                CXHandle::initWithType_value(
                    allocated,
                    CXHandleType::Generic,
                    &NSString::from_str("Sable"),
                )
            };
            let action = unsafe {
                let allocated = CXStartCallAction::alloc();
                CXStartCallAction::initWithCallUUID_handle(allocated, &uuid, &handle)
            };
            let completion: RcBlock<dyn Fn(*mut objc2_foundation::NSError)> =
                RcBlock::new(move |_error: *mut objc2_foundation::NSError| {});
            unsafe {
                controller.requestTransactionWithAction_completion(&action, &completion);
            }
            Ok(())
        })
    }

    pub fn end_call() -> Result<(), String> {
        CALLKIT.with(|s| -> Result<(), String> {
            let mut s = s.borrow_mut();
            let uuid = match s.uuid.take() {
                Some(uuid) => uuid,
                None => return Ok(()),
            };
            let controller = match s.controller.as_ref() {
                Some(c) => c.clone(),
                None => return Ok(()),
            };

            let action = unsafe {
                let allocated = CXEndCallAction::alloc();
                CXEndCallAction::initWithCallUUID(allocated, &uuid)
            };
            let completion: RcBlock<dyn Fn(*mut objc2_foundation::NSError)> =
                RcBlock::new(move |_error: *mut objc2_foundation::NSError| {});
            unsafe {
                controller.requestTransactionWithAction_completion(&action, &completion);
            }
            Ok(())
        })
    }

    fn random_uuid_bytes() -> [u8; 16] {
        use std::time::{SystemTime, UNIX_EPOCH};
        let mut bytes = [0u8; 16];
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let n = nanos.to_le_bytes();
        for i in 0..16 {
            bytes[i] = n[i % 16].wrapping_add(i as u8);
        }
        bytes[6] = (bytes[6] & 0x0F) | 0x40; // RFC 4122 v4
        bytes[8] = (bytes[8] & 0x3F) | 0x80;
        bytes
    }
}

pub fn hide_form_accessory_bar(window: &WebviewWindow<crate::BrowserEngine>) {
    let _ = window.with_webview(|webview| unsafe {
        let webview: *mut AnyObject = webview.inner().cast();
        let scroll_view: *mut AnyObject = msg_send![&*webview, scrollView];
        let subviews: *mut AnyObject = msg_send![&*scroll_view, subviews];
        let count: usize = msg_send![&*subviews, count];
        for index in 0..count {
            let subview: *mut AnyObject = msg_send![&*subviews, objectAtIndex: index];
            let class = (*subview).class();
            if !class.name().to_bytes().starts_with(b"WKContent") {
                continue;
            }
            let Ok(subclass_name) =
                CString::new(format!("{}_NoAccessoryBar", class.name().to_string_lossy()))
            else {
                continue;
            };
            let subclass = AnyClass::get(&subclass_name).unwrap_or_else(|| {
                let mut builder = ClassBuilder::new(&subclass_name, class)
                    .expect("accessory bar subclass already registered");
                builder.add_method(
                    sel!(inputAccessoryView),
                    input_accessory_view_nil as extern "C-unwind" fn(_, _) -> _,
                );
                builder.register()
            });
            AnyObject::set_class(&*subview, subclass);
        }
    });
}

// WKWebView plays HTMLAudioElement on .playback, ignoring the silent switch.
// AudioServicesPlaySystemSound respects the switch and uses ringer volume.

use objc2_foundation::NSURL;

// This library is linked by Cargo before Xcode creates the application bundle,
// so declaring AudioToolbox only in tauri.conf.json is not sufficient.
#[link(name = "AudioToolbox", kind = "framework")]
extern "C" {
    fn AudioServicesCreateSystemSoundID(
        in_file_url: *const objc2::runtime::AnyObject,
        out_sound_id: *mut u32,
    ) -> i32;
    fn AudioServicesPlaySystemSound(sound_id: u32);
}

fn load_system_sound(caf_bytes: &[u8], temp_name: &str) -> Result<u32, String> {
    // AudioServicesCreateSystemSoundID needs a file URL, so write the
    // embedded .caf to the app's temp directory on first use.
    let mut path = std::env::temp_dir();
    path.push(temp_name);
    if !path.exists() {
        std::fs::write(&path, caf_bytes)
            .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
    }
    unsafe {
        let path_str = NSString::from_str(&path.to_string_lossy());
        let url = NSURL::fileURLWithPath(&path_str);
        let mut sound_id: u32 = 0;
        let status = AudioServicesCreateSystemSoundID(Retained::as_ptr(&url).cast(), &mut sound_id);
        if status != 0 || sound_id == 0 {
            return Err(format!(
                "AudioServicesCreateSystemSoundID failed for {} with status {status}",
                path.display()
            ));
        }
        Ok(sound_id)
    }
}

static NOTIFICATION_SOUND_PLAYING: AtomicBool = AtomicBool::new(false);

pub(crate) fn play_notification_sound(kind: String) -> Result<(), String> {
    static NOTIFICATION_SOUND: OnceLock<u32> = OnceLock::new();
    static INVITE_SOUND: OnceLock<u32> = OnceLock::new();

    // AudioServices plays asynchronously and cannot stop an active sound. Drop
    // bursts until this clip finishes instead of overlapping notification audio.
    if NOTIFICATION_SOUND_PLAYING.swap(true, Ordering::Relaxed) {
        return Ok(());
    }

    let cache = if kind == "invite" {
        &INVITE_SOUND
    } else {
        &NOTIFICATION_SOUND
    };
    let caf: &[u8] = if kind == "invite" {
        include_bytes!("../resources/invite.caf")
    } else {
        include_bytes!("../resources/notification.caf")
    };
    let name = if kind == "invite" {
        "sable_invite.caf"
    } else {
        "sable_notification.caf"
    };

    // Not get_or_init: a failed load must not be cached as permanent silence.
    let sound_id = match cache.get() {
        Some(id) => *id,
        None => {
            let id = match load_system_sound(caf, name) {
                Ok(id) => id,
                Err(error) => {
                    NOTIFICATION_SOUND_PLAYING.store(false, Ordering::Relaxed);
                    return Err(error);
                }
            };
            let _ = cache.set(id);
            id
        }
    };
    unsafe { AudioServicesPlaySystemSound(sound_id) };
    let duration = if kind == "invite" {
        Duration::from_millis(1905)
    } else {
        Duration::from_millis(817)
    };
    std::thread::spawn(move || {
        std::thread::sleep(duration);
        NOTIFICATION_SOUND_PLAYING.store(false, Ordering::Relaxed);
    });
    Ok(())
}

// PhotoKit lane for saving images to the camera roll with add-only access;
// the prompt text is NSPhotoLibraryAddUsageDescription in ios-project.yml.

// Empty block only to emit the linker directive, same role as AudioToolbox above.
#[link(name = "Photos", kind = "framework")]
extern "C" {}

use std::ffi::OsStr;
use std::sync::Mutex;

use block2::RcBlock;
use objc2_photos::{
    PHAccessLevel, PHAssetCreationRequest, PHAssetResourceType, PHAuthorizationStatus,
    PHPhotoLibrary,
};
use tokio::sync::oneshot;

fn photo_access_allowed(status: PHAuthorizationStatus) -> bool {
    // Add-only access: .limited still permits adds (it only restricts reads).
    status == PHAuthorizationStatus::Authorized || status == PHAuthorizationStatus::Limited
}

fn photo_authorization_error(status: PHAuthorizationStatus) -> String {
    if status == PHAuthorizationStatus::Denied {
        "permission denied: allow photo access in Settings > Apps > Sable > Photos".to_string()
    } else if status == PHAuthorizationStatus::Restricted {
        "saving to Photos is blocked by device management or parental controls".to_string()
    } else {
        format!("unexpected photo authorization status: {status:?}")
    }
}

async fn request_photo_add_authorization() -> Result<(), String> {
    let status =
        unsafe { PHPhotoLibrary::authorizationStatusForAccessLevel(PHAccessLevel::AddOnly) };
    if photo_access_allowed(status) {
        return Ok(());
    }
    if status != PHAuthorizationStatus::NotDetermined {
        return Err(photo_authorization_error(status));
    }

    let (tx, rx) = oneshot::channel::<PHAuthorizationStatus>();
    {
        let tx = Mutex::new(Some(tx));
        let handler: RcBlock<dyn Fn(PHAuthorizationStatus)> = RcBlock::new(move |status| {
            if let Ok(mut guard) = tx.lock() {
                if let Some(tx) = guard.take() {
                    let _ = tx.send(status);
                }
            }
        });
        unsafe {
            PHPhotoLibrary::requestAuthorizationForAccessLevel_handler(
                PHAccessLevel::AddOnly,
                &handler,
            );
        }
        // PhotoKit copies the handler; keep the !Send RcBlock out of the await below.
    }

    let granted = rx
        .await
        .map_err(|_| "photo authorization request was cancelled".to_string())?;
    if photo_access_allowed(granted) {
        Ok(())
    } else {
        Err(photo_authorization_error(granted))
    }
}

fn write_media_to_photo_library(bytes: &[u8], filename: &str) -> Result<(), String> {
    // PhotoKit infers the content type from the file URL, so the temp file
    // keeps the extension; `file_name` strips any directory components.
    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);
    let leaf = std::path::Path::new(filename)
        .file_name()
        .unwrap_or_else(|| OsStr::new("download"));
    let mut path = std::env::temp_dir();
    path.push(format!(
        "sable-photos-{}-{}-{}",
        std::process::id(),
        TEMP_COUNTER.fetch_add(1, Ordering::Relaxed),
        leaf.to_string_lossy()
    ));

    if let Err(error) = std::fs::write(&path, bytes) {
        let _ = std::fs::remove_file(&path);
        return Err(format!("failed to write {}: {error}", path.display()));
    }

    let result = unsafe {
        let path_str = NSString::from_str(&path.to_string_lossy());
        let url = NSURL::fileURLWithPath(&path_str);
        let library = PHPhotoLibrary::sharedPhotoLibrary();
        // PhotoKit rejects creation requests instantiated outside the change block.
        let change: RcBlock<dyn Fn()> = RcBlock::new(move || {
            let request = PHAssetCreationRequest::creationRequestForAsset();
            request.addResourceWithType_fileURL_options(PHAssetResourceType::Photo, &url, None);
        });
        library
            .performChangesAndWait_error(RcBlock::as_ptr(&change))
            .map_err(|error| {
                format!(
                    "failed to save '{filename}' to Photos ({} error {}): {}",
                    error.domain(),
                    error.code(),
                    error.localizedDescription()
                )
            })
    };
    let _ = std::fs::remove_file(&path);
    result
}

#[tauri::command]
pub async fn save_media_to_photos(
    bytes: Vec<u8>,
    filename: String,
    mime_type: String,
) -> Result<(), String> {
    if !mime_type.starts_with("image/") {
        return Err(format!(
            "unsupported media type '{mime_type}': only images can be saved to Photos"
        ));
    }

    request_photo_add_authorization().await?;

    // performChangesAndWait blocks until commit; it must not run on the main thread.
    tauri::async_runtime::spawn_blocking(move || write_media_to_photo_library(&bytes, &filename))
        .await
        .map_err(|error| format!("failed to run photo save: {error}"))?
}
