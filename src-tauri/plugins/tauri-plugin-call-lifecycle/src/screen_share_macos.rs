use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc as std_mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use livekit::options::TrackPublishOptions;
use livekit::track::{LocalTrack, LocalVideoTrack, TrackSource};
use livekit::webrtc::video_frame::{I420Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_source::{RtcVideoSource, VideoResolution};
use livekit::Room;
use screencapturekit::async_api::{AsyncSCShareableContent, AsyncSCStream};
use screencapturekit::cm::CMSampleBufferExt;
use screencapturekit::stream::configuration::{PixelFormat, SCStreamConfiguration};
use screencapturekit::stream::content_filter::SCContentFilter;
use screencapturekit::stream::output_type::SCStreamOutputType;
use tokio::sync::{mpsc, oneshot};

const SCREEN_FPS: u64 = 30;

#[derive(Debug, Clone, Copy)]
pub(crate) enum ScreenShareFailure {
    Portal,
    Capture,
}

pub(crate) struct ScreenShareSession {
    cancellation: Arc<AtomicBool>,
    monitor_stop: Option<oneshot::Sender<()>>,
    monitor_task: Option<tokio::task::JoinHandle<()>>,
    video_worker: Option<VideoWorker>,
    stopped: bool,
}

struct BgraFrame {
    data: Vec<u8>,
    stride: usize,
    width: usize,
    height: usize,
}

struct LatestFrame(Mutex<Option<BgraFrame>>);

impl LatestFrame {
    fn new() -> Self {
        Self(Mutex::new(None))
    }

    fn replace(&self, frame: BgraFrame) {
        *self.0.lock().unwrap() = Some(frame);
    }

    fn take(&self) -> Option<BgraFrame> {
        self.0.lock().unwrap().take()
    }
}

struct VideoWorker {
    stop: std_mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}

impl VideoWorker {
    async fn stop_and_join(mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() {
            let _ = tokio::task::spawn_blocking(move || thread.join()).await;
        }
    }

    fn signal_stop(&self) {
        let _ = self.stop.send(());
    }
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
    let chroma_width = width.div_ceil(2);
    let chroma_height = height.div_ceil(2);
    for row in 0..chroma_height {
        for column in 0..chroma_width {
            let mut red = 0i32;
            let mut green = 0i32;
            let mut blue = 0i32;
            let mut count = 0i32;
            for y_row in (row * 2)..(row * 2 + 2).min(height) {
                for x in (column * 2)..(column * 2 + 2).min(width) {
                    let offset = y_row * stride + x * 4;
                    blue += data[offset] as i32;
                    green += data[offset + 1] as i32;
                    red += data[offset + 2] as i32;
                    count += 1;
                }
            }
            let red = red / count;
            let green = green / count;
            let blue = blue / count;
            u[row * u_stride as usize + column] =
                (((-38 * red - 74 * green + 112 * blue + 128) >> 8) + 128).clamp(0, 255) as u8;
            v[row * v_stride as usize + column] =
                (((112 * red - 94 * green - 18 * blue + 128) >> 8) + 128).clamp(0, 255) as u8;
        }
    }
    Ok(i420)
}

async fn capture_loop(
    stream: AsyncSCStream,
    slot: Arc<LatestFrame>,
    cancellation: Arc<AtomicBool>,
    mut stop_rx: oneshot::Receiver<()>,
    failure_tx: mpsc::UnboundedSender<ScreenShareFailure>,
) {
    let mut stream = stream;
    loop {
        tokio::select! {
            _ = &mut stop_rx => break,
            sample = stream.next() => {
                if cancellation.load(Ordering::Acquire) {
                    break;
                }
                let Some(sample) = sample else {
                    let _ = stream.take_error();
                    let _ = failure_tx.send(ScreenShareFailure::Capture);
                    break;
                };
                let Some(pixel_buffer) = sample.image_buffer() else {
                    let _ = failure_tx.send(ScreenShareFailure::Capture);
                    break;
                };
                let Ok(buffer) = pixel_buffer.lock_read_only() else {
                    let _ = failure_tx.send(ScreenShareFailure::Capture);
                    break;
                };
                let width = buffer.width();
                let height = buffer.height();
                let stride = buffer.bytes_per_row();
                let row_bytes = width.checked_mul(4);
                let data = buffer.as_slice();
                if row_bytes.is_none()
                    || stride < row_bytes.unwrap()
                    || data.len() < stride.saturating_mul(height)
                {
                    let _ = failure_tx.send(ScreenShareFailure::Capture);
                    break;
                }
                if cancellation.load(Ordering::Acquire) {
                    break;
                }
                slot.replace(BgraFrame {
                    data: data.to_vec(),
                    stride,
                    width,
                    height,
                });
            }
        }
    }
    if stream.stop_capture().await.is_err() {
        let _ = failure_tx.send(ScreenShareFailure::Capture);
    }
}

fn spawn_video_worker(
    source: NativeVideoSource,
    slot: Arc<LatestFrame>,
    cancellation: Arc<AtomicBool>,
    failure_tx: mpsc::UnboundedSender<ScreenShareFailure>,
) -> VideoWorker {
    let (stop_tx, stop_rx) = std_mpsc::channel();
    let thread = thread::spawn(move || loop {
        match stop_rx.recv_timeout(Duration::from_millis(1000 / SCREEN_FPS)) {
            Ok(()) | Err(std_mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std_mpsc::RecvTimeoutError::Timeout) => {}
        }
        if cancellation.load(Ordering::Acquire) {
            break;
        }
        let Some(frame) = slot.take() else { continue };
        let Ok(i420) = bgra_to_i420(&frame.data, frame.stride, frame.width, frame.height) else {
            let _ = failure_tx.send(ScreenShareFailure::Capture);
            break;
        };
        if cancellation.load(Ordering::Acquire) {
            break;
        }
        source.capture_frame(&VideoFrame::new(VideoRotation::VideoRotation0, i420));
    });
    VideoWorker {
        stop: stop_tx,
        thread: Some(thread),
    }
}

impl ScreenShareSession {
    pub(crate) async fn start(
        room: &Room,
    ) -> Result<(Self, mpsc::UnboundedReceiver<ScreenShareFailure>), String> {
        let content = AsyncSCShareableContent::get()
            .await
            .map_err(|error| format!("failed to get macOS shareable content: {error}"))?;
        let display = content
            .displays()
            .first()
            .ok_or_else(|| "no macOS display is available for screen sharing".to_owned())?;
        let width = display.width();
        let height = display.height();
        let filter = SCContentFilter::create()
            .with_display(display)
            .with_excluding_windows(&[])
            .build();
        let config = SCStreamConfiguration::new()
            .with_width(width)
            .with_height(height)
            .with_pixel_format(PixelFormat::BGRA)
            .with_shows_cursor(true);
        let stream = AsyncSCStream::new(&filter, &config, 1, SCStreamOutputType::Screen);
        stream
            .start_capture()
            .await
            .map_err(|error| format!("failed to start macOS screen capture: {error}"))?;

        let source = NativeVideoSource::new(VideoResolution { width, height }, true);
        let track = LocalVideoTrack::create_video_track(
            "screen-share",
            RtcVideoSource::Native(source.clone()),
        );
        if let Err(error) = room
            .local_participant()
            .publish_track(
                LocalTrack::Video(track),
                TrackPublishOptions {
                    source: TrackSource::Screenshare,
                    ..Default::default()
                },
            )
            .await
        {
            let _ = stream.stop_capture().await;
            return Err(format!("failed to publish screen-share track: {error}"));
        }

        let (failure_tx, failure_rx) = mpsc::unbounded_channel();
        let slot = Arc::new(LatestFrame::new());
        let cancellation = Arc::new(AtomicBool::new(false));
        let video_worker = spawn_video_worker(
            source.clone(),
            slot.clone(),
            cancellation.clone(),
            failure_tx.clone(),
        );
        let (monitor_stop, stop_rx) = oneshot::channel();
        let monitor_task = tokio::spawn(capture_loop(
            stream,
            slot,
            cancellation.clone(),
            stop_rx,
            failure_tx,
        ));
        Ok((
            Self {
                cancellation,
                monitor_stop: Some(monitor_stop),
                monitor_task: Some(monitor_task),
                video_worker: Some(video_worker),
                stopped: false,
            },
            failure_rx,
        ))
    }

    pub(crate) async fn shutdown(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        self.cancellation.store(true, Ordering::Release);
        if let Some(stop) = self.monitor_stop.take() {
            let _ = stop.send(());
        }
        if let Some(task) = self.monitor_task.take() {
            let _ = task.await;
        }
        if let Some(worker) = self.video_worker.take() {
            worker.stop_and_join().await;
        }
    }
}

impl Drop for ScreenShareSession {
    fn drop(&mut self) {
        self.cancellation.store(true, Ordering::Release);
        if let Some(stop) = self.monitor_stop.take() {
            let _ = stop.send(());
        }
        if let Some(task) = self.monitor_task.take() {
            task.abort();
        }
        if let Some(worker) = &self.video_worker {
            worker.signal_stop();
        }
    }
}
