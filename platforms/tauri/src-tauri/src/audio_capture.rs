use serde::Serialize;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInfo {
    pub port: u16,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Shared state for audio capture, managed by Tauri.
#[derive(Default)]
pub struct AudioCaptureState {
    inner: Arc<Mutex<Option<CaptureHandle>>>,
}

struct CaptureHandle {
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl AudioCaptureState {
    pub async fn start(&self) -> Result<CaptureInfo, AudioCaptureError> {
        let mut guard = self.inner.lock().await;
        if guard.is_some() {
            return Err(AudioCaptureError::AlreadyRunning);
        }

        let info = start_loopback_capture(&mut guard)?;
        Ok(info)
    }

    pub async fn stop(&self) -> Result<(), AudioCaptureError> {
        let mut guard = self.inner.lock().await;
        match guard.take() {
            Some(handle) => {
                let _ = handle.shutdown_tx.send(());
                Ok(())
            }
            None => Err(AudioCaptureError::NotRunning),
        }
    }
}

#[derive(Debug)]
pub enum AudioCaptureError {
    AlreadyRunning,
    NotRunning,
    #[allow(dead_code)]
    Platform(String),
}

impl std::fmt::Display for AudioCaptureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AlreadyRunning => write!(f, "Audio capture is already running"),
            Self::NotRunning => write!(f, "Audio capture is not running"),
            Self::Platform(msg) => write!(f, "Platform error: {msg}"),
        }
    }
}

impl std::error::Error for AudioCaptureError {}

// ─── Windows WASAPI loopback capture ───────────────────────────────────

#[cfg(windows)]
fn start_loopback_capture(
    handle_slot: &mut Option<CaptureHandle>,
) -> Result<CaptureInfo, AudioCaptureError> {
    use std::net::TcpListener;

    // Bind an ephemeral port for the local WebSocket server
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AudioCaptureError::Platform(format!("Failed to bind TCP: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| AudioCaptureError::Platform(format!("No local addr: {e}")))?
        .port();

    // Default loopback format: 48kHz stereo float32 (common for Windows audio)
    let sample_rate: u32 = 48000;
    let channels: u16 = 2;

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    // Spawn the capture + WebSocket server on a dedicated thread because
    // WASAPI COM calls must happen on the thread that initialized COM.
    std::thread::spawn(move || {
        if let Err(e) = run_wasapi_capture_server(listener, shutdown_rx, sample_rate, channels) {
            log::error!("WASAPI capture server error: {e}");
        }
    });

    *handle_slot = Some(CaptureHandle { shutdown_tx });

    Ok(CaptureInfo {
        port,
        sample_rate,
        channels,
    })
}

#[cfg(windows)]
fn run_wasapi_capture_server(
    listener: std::net::TcpListener,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    sample_rate: u32,
    channels: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::*;

    // Initialize COM for this thread
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
    }

    // Get the default audio render endpoint (speakers/headphones)
    let enumerator: IMMDeviceEnumerator = unsafe {
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?
    };
    let device: IMMDevice = unsafe {
        enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?
    };

    // Activate the audio client in loopback mode
    let audio_client: IAudioClient = unsafe { device.Activate(CLSCTX_ALL, None)? };

    // Get the mix format
    let mix_format_ptr = unsafe { audio_client.GetMixFormat()? };
    let mix_format = unsafe { &*mix_format_ptr };

    let actual_sample_rate = mix_format.nSamplesPerSec;
    let actual_channels = mix_format.nChannels;
    let block_align = mix_format.nBlockAlign;

    // Initialize in loopback capture mode with a 50ms buffer
    let buffer_duration: i64 = 500_000; // 50ms in 100ns units
    unsafe {
        audio_client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            buffer_duration,
            0,
            mix_format_ptr,
            None,
        )?;
    }

    let capture_client: IAudioCaptureClient = unsafe { audio_client.GetService()? };

    // Start capture
    unsafe { audio_client.Start()? };

    // Accept one WebSocket client
    listener.set_nonblocking(false)?;
    // Set a timeout so we can check the shutdown signal
    listener.set_nonblocking(true)?;

    // Wait for a client connection (with shutdown check)
    let mut ws = loop {
        match listener.accept() {
            Ok((stream, _)) => {
                stream.set_nonblocking(false)?;
                break tungstenite::accept(stream)?;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if shutdown_rx.try_recv().is_ok() {
                    unsafe { audio_client.Stop()? };
                    return Ok(());
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Err(e) => return Err(Box::new(e)),
        }
    };

    // Capture loop: read WASAPI buffer and send over WebSocket
    loop {
        if shutdown_rx.try_recv().is_ok() {
            break;
        }

        let packet_size = unsafe { capture_client.GetNextPacketSize()? };
        if packet_size == 0 {
            std::thread::sleep(std::time::Duration::from_millis(5));
            continue;
        }

        let mut buffer_ptr = std::ptr::null_mut();
        let mut num_frames = 0u32;
        let mut flags = 0u32;

        unsafe {
            capture_client.GetBuffer(
                &mut buffer_ptr,
                &mut num_frames,
                &mut flags,
                None,
                None,
            )?;
        }

        if num_frames > 0 && !buffer_ptr.is_null() {
            let byte_count = num_frames as usize * block_align as usize;
            let data = unsafe { std::slice::from_raw_parts(buffer_ptr as *const u8, byte_count) };

            // Convert to f32 samples if needed, or send raw
            // WASAPI loopback typically gives us float32 PCM already
            if ws
                .send(tungstenite::Message::Binary(data.to_vec().into()))
                .is_err()
            {
                // Client disconnected
                break;
            }
        }

        unsafe {
            capture_client.ReleaseBuffer(num_frames)?;
        }
    }

    unsafe { audio_client.Stop()? };

    let _ = ws.close(None);

    // Log actual vs requested format for debugging
    log::info!(
        "WASAPI capture ended. Device format: {}Hz {}ch (requested: {}Hz {}ch)",
        actual_sample_rate,
        actual_channels,
        sample_rate,
        channels
    );

    Ok(())
}

#[cfg(not(windows))]
fn start_loopback_capture(
    _handle_slot: &mut Option<CaptureHandle>,
) -> Result<CaptureInfo, AudioCaptureError> {
    Err(AudioCaptureError::Platform(
        "Audio capture is only supported on Windows".to_string(),
    ))
}
