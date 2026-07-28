use std::ffi::c_void;
use std::sync::mpsc as std_mpsc;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::Duration;

use livekit::options::TrackPublishOptions;
use livekit::track::{LocalTrack, LocalVideoTrack, TrackSource};
use livekit::webrtc::video_frame::{I420Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_source::{RtcVideoSource, VideoResolution};
use livekit::Room;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::{AppHandle, Runtime};
use tokio::sync::{mpsc, oneshot};
use windows::core::Interface;
use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{
    Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCapturePicker,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::{DirectXPixelFormat, DirectXPixelFormat::B8G8R8A8UIntNormalized};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_CPU_ACCESS_READ,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
use windows::Win32::UI::Shell::IInitializeWithWindow;

const SCREEN_FPS: u64 = 30;

#[derive(Debug, Clone, Copy)]
pub(crate) enum ScreenShareFailure {
    Capture,
}

struct BgraFrame {
    data: Vec<u8>,
    stride: usize,
    width: usize,
    height: usize,
}

struct LatestFrame {
    frame: Mutex<Option<BgraFrame>>,
}

impl LatestFrame {
    fn replace(&self, frame: BgraFrame) {
        if let Ok(mut latest) = self.frame.lock() {
            *latest = Some(frame);
        }
    }

    fn take(&self) -> Option<BgraFrame> {
        self.frame.lock().ok()?.take()
    }
}

struct GpuReader {
    context: ID3D11DeviceContext,
    staging: ID3D11Texture2D,
    width: u32,
    height: u32,
}

impl GpuReader {
    fn read(&mut self, texture: &ID3D11Texture2D) -> Result<BgraFrame, ()> {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { texture.GetDesc(&mut desc) };
        if desc.Width != self.width
            || desc.Height != self.height
            || desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM
        {
            return Err(());
        }

        unsafe {
            self.context.CopyResource(&self.staging, texture);
        }
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            self.context
                .Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .map_err(|_| ())?;
        }
        let _map_guard = MappedTexture {
            context: &self.context,
            texture: &self.staging,
        };
        let stride = mapped.RowPitch as usize;
        let row_bytes = usize::try_from(self.width.checked_mul(4).ok_or(())?).map_err(|_| ())?;
        let size = stride.checked_mul(self.height as usize).ok_or(())?;
        if stride < row_bytes || mapped.pData.is_null() {
            return Err(());
        }
        let data = unsafe { std::slice::from_raw_parts(mapped.pData.cast::<u8>(), size) }.to_vec();
        Ok(BgraFrame {
            data,
            stride,
            width: self.width as usize,
            height: self.height as usize,
        })
    }
}

struct MappedTexture<'a> {
    context: &'a ID3D11DeviceContext,
    texture: &'a ID3D11Texture2D,
}

impl Drop for MappedTexture<'_> {
    fn drop(&mut self) {
        unsafe { self.context.Unmap(self.texture, 0) };
    }
}

pub(crate) struct ScreenShareSession {
    stop_tx: Option<std_mpsc::Sender<()>>,
    video_stop_tx: Option<std_mpsc::Sender<()>>,
    capture_thread: Option<thread::JoinHandle<()>>,
    video_thread: Option<thread::JoinHandle<()>>,
}

impl Drop for ScreenShareSession {
    fn drop(&mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            let _ = stop_tx.send(());
        }
        if let Some(video_stop_tx) = self.video_stop_tx.take() {
            let _ = video_stop_tx.send(());
        }
    }
}

fn signal_terminal_failure(
    failure_tx: &mpsc::UnboundedSender<ScreenShareFailure>,
    failure_signaled: &AtomicBool,
) {
    if !failure_signaled.swap(true, Ordering::AcqRel) {
        let _ = failure_tx.send(ScreenShareFailure::Capture);
    }
}

async fn pick_item<R: Runtime>(app: &AppHandle<R>) -> Result<GraphicsCaptureItem, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_owned())?;
    let (result_tx, result_rx) = oneshot::channel();

    let window_for_handle = window.clone();
    window
        .run_on_main_thread(move || {
            let operation = (|| {
                let raw = window_for_handle
                    .window_handle()
                    .map_err(|error| format!("failed to get main window handle: {error}"))?
                    .as_raw();
                let RawWindowHandle::Win32(handle) = raw else {
                    return Err("main window does not expose a Win32 handle".to_owned());
                };
                let picker = GraphicsCapturePicker::new()
                    .map_err(|error| format!("failed to create screen-share picker: {error}"))?;
                let initializer = picker.cast::<IInitializeWithWindow>().map_err(|error| {
                    format!("failed to access picker window initializer: {error}")
                })?;
                unsafe {
                    initializer
                        .Initialize(HWND(handle.hwnd.get() as *mut c_void))
                        .map_err(|error| {
                            format!("failed to initialize screen-share picker: {error}")
                        })?;
                }
                let operation = picker
                    .PickSingleItemAsync()
                    .map_err(|error| format!("failed to open screen-share picker: {error}"))?;
                Ok(operation)
            })();
            match operation {
                Ok(operation) => {
                    tauri::async_runtime::spawn(async move {
                        let _ = result_tx.send(
                            operation
                                .await
                                .map_err(|error| format!("screen-share picker failed: {error}")),
                        );
                    });
                }
                Err(error) => {
                    let _ = result_tx.send(Err(error));
                }
            }
        })
        .map_err(|error| format!("failed to run screen-share picker on the UI thread: {error}"))?;

    result_rx
        .await
        .map_err(|_| "screen-share picker task ended unexpectedly".to_owned())?
        .map_err(|error| error)
}

fn create_d3d_device() -> Result<(ID3D11Device, ID3D11DeviceContext, IDirect3DDevice), String> {
    let mut device = None;
    let mut context = None;
    let mut feature_level = D3D_FEATURE_LEVEL_11_0;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&[D3D_FEATURE_LEVEL_11_0]),
            7,
            Some(&mut device),
            Some(&mut feature_level),
            Some(&mut context),
        )
        .map_err(|error| format!("failed to create D3D11 device: {error}"))?;
    }
    let device = device.ok_or_else(|| "D3D11 returned no device".to_owned())?;
    let context = context.ok_or_else(|| "D3D11 returned no immediate context".to_owned())?;
    let dxgi_device = device
        .cast::<IDXGIDevice>()
        .map_err(|error| format!("failed to query DXGI device: {error}"))?;
    let inspectable = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device) }
        .map_err(|error| format!("failed to create WinRT D3D11 device: {error}"))?;
    let winrt_device = inspectable
        .cast::<IDirect3DDevice>()
        .map_err(|error| format!("failed to cast WinRT D3D11 device: {error}"))?;
    Ok((device, context, winrt_device))
}

fn create_staging_texture(
    device: &ID3D11Device,
    width: u32,
    height: u32,
) -> Result<ID3D11Texture2D, String> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut staging = None;
    unsafe {
        device
            .CreateTexture2D(&desc, None, Some(&mut staging as *mut _))
            .map_err(|error| format!("failed to create staging texture: {error}"))?;
    }
    staging.ok_or_else(|| "D3D11 returned no staging texture".to_owned())
}

fn capture_thread(
    item: GraphicsCaptureItem,
    stop_rx: std_mpsc::Receiver<()>,
    latest_frame: Arc<LatestFrame>,
    failure_tx: mpsc::UnboundedSender<ScreenShareFailure>,
    failure_signaled: Arc<AtomicBool>,
    ready_tx: std_mpsc::Sender<Result<(u32, u32), String>>,
) {
    let initialized = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_ok();
    if !initialized {
        let _ = ready_tx.send(Err(
            "failed to initialize WinRT on capture thread".to_owned()
        ));
        signal_terminal_failure(&failure_tx, &failure_signaled);
        return;
    }
    let result = (|| {
        let size = item
            .Size()
            .map_err(|error| format!("failed to get capture item size: {error}"))?;
        let width = u32::try_from(size.Width).map_err(|_| "capture width is invalid".to_owned())?;
        let height =
            u32::try_from(size.Height).map_err(|_| "capture height is invalid".to_owned())?;
        if width == 0 || height == 0 {
            return Err("capture item has an empty size".to_owned());
        }
        let (device, context, winrt_device) = create_d3d_device()?;
        let staging = create_staging_texture(&device, width, height)?;
        let reader = Arc::new(Mutex::new(GpuReader {
            context,
            staging,
            width,
            height,
        }));
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            size,
        )
        .map_err(|error| format!("failed to create capture frame pool: {error}"))?;
        let session = pool
            .CreateCaptureSession(&item)
            .map_err(|error| format!("failed to create capture session: {error}"))?;
        session
            .SetIsCursorCaptureEnabled(true)
            .map_err(|error| format!("failed to enable cursor capture: {error}"))?;

        let callback_pool = pool.clone();
        let callback_reader = reader.clone();
        let callback_frames = latest_frame.clone();
        let callback_failures = failure_tx.clone();
        let callback_failure_signaled = failure_signaled.clone();
        let frame_handler = TypedEventHandler::new(
            move |_pool: Option<&Direct3D11CaptureFramePool>, _| -> windows::core::Result<()> {
                if callback_failure_signaled.load(Ordering::Acquire) {
                    return Ok(());
                }
                let result = (|| {
                    let frame = callback_pool.TryGetNextFrame()?;
                    let content_size = frame.ContentSize()?;
                    let mut read = callback_reader
                        .lock()
                        .map_err(|_| windows::core::Error::from_win32())?;
                    if content_size.Width != read.width as i32
                        || content_size.Height != read.height as i32
                    {
                        let _ = frame.Close();
                        return Err(windows::core::Error::from_win32());
                    }
                    let surface = frame.Surface()?;
                    let access = surface.cast::<IDirect3DDxgiInterfaceAccess>()?;
                    let texture = unsafe { access.GetInterface::<ID3D11Texture2D>() }?;
                    let frame_result = read
                        .read(&texture)
                        .map_err(|_| windows::core::Error::from_win32());
                    let close_result = frame.Close();
                    match (frame_result, close_result) {
                        (Ok(frame), Ok(())) => {
                            callback_frames.replace(frame);
                            Ok(())
                        }
                        (Err(error), _) => Err(error),
                        (_, Err(error)) => Err(error),
                    }
                })();
                if let Err(error) = result {
                    signal_terminal_failure(&callback_failures, &callback_failure_signaled);
                    return Err(error);
                }
                Ok(())
            },
        );
        let frame_token = pool
            .FrameArrived(frame_handler)
            .map_err(|error| format!("failed to register capture callback: {error}"))?;

        let callback_failures = failure_tx.clone();
        let closed_failure_signaled = failure_signaled.clone();
        let closed_handler = TypedEventHandler::new(
            move |_item: Option<&GraphicsCaptureItem>, _| -> windows::core::Result<()> {
                signal_terminal_failure(&callback_failures, &closed_failure_signaled);
                Ok(())
            },
        );
        let closed_token = item
            .Closed(closed_handler)
            .map_err(|error| format!("failed to register capture close callback: {error}"))?;

        session
            .StartCapture()
            .map_err(|error| format!("failed to start capture: {error}"))?;
        let _ = ready_tx.send(Ok((width, height)));
        let _ = stop_rx.recv();
        let _ = item.RemoveClosed(closed_token);
        let _ = pool.RemoveFrameArrived(frame_token);
        let _ = session.Close();
        let _ = pool.Close();
        Ok(())
    })();
    if let Err(error) = result {
        let _ = ready_tx.send(Err(error));
        signal_terminal_failure(&failure_tx, &failure_signaled);
    }
    unsafe { RoUninitialize() };
}

fn bgra_to_i420(data: &[u8], stride: usize, width: usize, height: usize) -> Result<I420Buffer, ()> {
    let row_bytes = width.checked_mul(4).ok_or(())?;
    if width == 0
        || height == 0
        || stride < row_bytes
        || data.len() < stride.checked_mul(height).ok_or(())?
    {
        return Err(());
    }
    let mut i420 = I420Buffer::new(width as u32, height as u32);
    let (y_stride, u_stride, v_stride) = i420.strides();
    let (y, u, v) = i420.data_mut();
    for row in 0..height {
        for column in 0..width {
            let offset = row * stride + column * 4;
            let blue = data[offset] as i32;
            let green = data[offset + 1] as i32;
            let red = data[offset + 2] as i32;
            y[row * y_stride as usize + column] =
                (((66 * red + 129 * green + 25 * blue + 128) >> 8) + 16).clamp(0, 255) as u8;
        }
    }
    for row in 0..height.div_ceil(2) {
        for column in 0..width.div_ceil(2) {
            let mut red = 0;
            let mut green = 0;
            let mut blue = 0;
            let mut count = 0;
            for y_row in (row * 2)..(row * 2 + 2).min(height) {
                for x in (column * 2)..(column * 2 + 2).min(width) {
                    let offset = y_row * stride + x * 4;
                    blue += data[offset] as i32;
                    green += data[offset + 1] as i32;
                    red += data[offset + 2] as i32;
                    count += 1;
                }
            }
            red /= count;
            green /= count;
            blue /= count;
            u[row * u_stride as usize + column] =
                (((-38 * red - 74 * green + 112 * blue + 128) >> 8) + 128).clamp(0, 255) as u8;
            v[row * v_stride as usize + column] =
                (((112 * red - 94 * green - 18 * blue + 128) >> 8) + 128).clamp(0, 255) as u8;
        }
    }
    Ok(i420)
}

fn video_thread(
    source: NativeVideoSource,
    latest_frame: Arc<LatestFrame>,
    stop_rx: std_mpsc::Receiver<()>,
    failure_tx: mpsc::UnboundedSender<ScreenShareFailure>,
    failure_signaled: Arc<AtomicBool>,
) {
    loop {
        match stop_rx.recv_timeout(Duration::from_millis(1000 / SCREEN_FPS)) {
            Ok(()) | Err(std_mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std_mpsc::RecvTimeoutError::Timeout) => {}
        }
        let Some(frame) = latest_frame.take() else {
            continue;
        };
        let Ok(i420) = bgra_to_i420(&frame.data, frame.stride, frame.width, frame.height) else {
            signal_terminal_failure(&failure_tx, &failure_signaled);
            break;
        };
        source.capture_frame(&VideoFrame::new(VideoRotation::VideoRotation0, i420));
    }
}

impl ScreenShareSession {
    pub(crate) async fn start<R: Runtime>(
        app: &AppHandle<R>,
        room: &Room,
    ) -> Result<(Self, mpsc::UnboundedReceiver<ScreenShareFailure>), String> {
        let item = pick_item(app).await?;
        let (failure_tx, failure_rx) = mpsc::unbounded_channel();
        let latest_frame = Arc::new(LatestFrame {
            frame: Mutex::new(None),
        });
        let (stop_tx, stop_rx) = std_mpsc::channel();
        let (ready_tx, ready_rx) = std_mpsc::channel();
        let capture_failure_tx = failure_tx.clone();
        let failure_signaled = Arc::new(AtomicBool::new(false));
        let capture_latest = latest_frame.clone();
        let capture_failure_signaled = failure_signaled.clone();
        let capture_thread = thread::spawn(move || {
            capture_thread(
                item,
                stop_rx,
                capture_latest,
                capture_failure_tx,
                capture_failure_signaled,
                ready_tx,
            )
        });
        let ready = tokio::task::spawn_blocking(move || ready_rx.recv())
            .await
            .map_err(|_| "capture setup task panicked".to_owned())?
            .map_err(|_| "capture setup task ended unexpectedly".to_owned())?;
        let (width, height) = match ready {
            Ok(size) => size,
            Err(error) => {
                let _ = capture_thread.join();
                return Err(error);
            }
        };

        let source = NativeVideoSource::new(VideoResolution { width, height }, true);
        if let Err(error) = room
            .local_participant()
            .publish_track(
                LocalTrack::Video(LocalVideoTrack::create_video_track(
                    "screen-share",
                    RtcVideoSource::Native(source.clone()),
                )),
                TrackPublishOptions {
                    source: TrackSource::Screenshare,
                    ..Default::default()
                },
            )
            .await
        {
            let _ = stop_tx.send(());
            let _ = capture_thread.join();
            return Err(format!("failed to publish screen-share track: {error}"));
        }

        let (video_stop_tx, video_stop_rx) = std_mpsc::channel();
        let video_failure_tx = failure_tx.clone();
        let video_failure_signaled = failure_signaled.clone();
        let video_thread = thread::spawn(move || {
            video_thread(
                source,
                latest_frame,
                video_stop_rx,
                video_failure_tx,
                video_failure_signaled,
            )
        });
        Ok((
            Self {
                stop_tx: Some(stop_tx),
                video_stop_tx: Some(video_stop_tx),
                capture_thread: Some(capture_thread),
                video_thread: Some(video_thread),
            },
            failure_rx,
        ))
    }

    pub(crate) async fn shutdown(&mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            let _ = stop_tx.send(());
        }
        if let Some(video_stop_tx) = self.video_stop_tx.take() {
            let _ = video_stop_tx.send(());
        }
        if let Some(thread) = self.capture_thread.take() {
            let _ = tokio::task::spawn_blocking(move || thread.join()).await;
        }
        if let Some(thread) = self.video_thread.take() {
            let _ = tokio::task::spawn_blocking(move || thread.join()).await;
        }
    }
}
