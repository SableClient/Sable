use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use livekit::options::TrackPublishOptions;
use livekit::track::{LocalTrack, LocalVideoTrack, TrackSource};
use livekit::webrtc::video_frame::{I420Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_source::{RtcVideoSource, VideoResolution};
use livekit::Room;
use nokhwa::pixel_format::RgbFormat;
use nokhwa::utils::{CameraIndex, RequestedFormat, RequestedFormatType};
use nokhwa::Camera;
use tokio::sync::{mpsc as tokio_mpsc, oneshot};

const CAMERA_INDEX: u32 = 0;
const CAMERA_FPS: u32 = 30;

#[derive(Debug, Clone, Copy)]
pub(crate) enum CameraFailure {
    Camera,
    Video,
}

struct CameraFrame {
    width: u32,
    height: u32,
    stride: usize,
    data: Vec<u8>,
}

struct LatestFrame(Mutex<Option<CameraFrame>>);

impl LatestFrame {
    fn new() -> Self {
        Self(Mutex::new(None))
    }

    fn replace(&self, frame: CameraFrame) {
        *self.0.lock().unwrap() = Some(frame);
    }

    fn take(&self) -> Option<CameraFrame> {
        self.0.lock().unwrap().take()
    }
}

struct Worker {
    stop: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}

impl Worker {
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

fn rgb_to_yuv(red: u8, green: u8, blue: u8) -> (u8, u8, u8) {
    let red = red as i32;
    let green = green as i32;
    let blue = blue as i32;
    (
        (((66 * red + 129 * green + 25 * blue + 128) >> 8) + 16).clamp(0, 255) as u8,
        (((-38 * red - 74 * green + 112 * blue + 128) >> 8) + 128).clamp(0, 255) as u8,
        (((112 * red - 94 * green - 18 * blue + 128) >> 8) + 128).clamp(0, 255) as u8,
    )
}

fn rgb24_to_i420(
    rgb: &[u8],
    stride: usize,
    width: usize,
    height: usize,
    y: &mut [u8],
    y_stride: usize,
    u: &mut [u8],
    u_stride: usize,
    v: &mut [u8],
    v_stride: usize,
) -> Result<(), ()> {
    let chroma_width = width.div_ceil(2);
    let chroma_height = height.div_ceil(2);
    if width == 0
        || height == 0
        || stride < width.checked_mul(3).ok_or(())?
        || rgb.len() < stride.checked_mul(height).ok_or(())?
        || y_stride < width
        || u_stride < chroma_width
        || v_stride < chroma_width
        || y.len() < y_stride.checked_mul(height).ok_or(())?
        || u.len() < u_stride.checked_mul(chroma_height).ok_or(())?
        || v.len() < v_stride.checked_mul(chroma_height).ok_or(())?
    {
        return Err(());
    }
    for row in 0..height {
        for column in 0..width {
            let offset = row * stride + column * 3;
            y[row * y_stride + column] =
                rgb_to_yuv(rgb[offset], rgb[offset + 1], rgb[offset + 2]).0;
        }
    }
    for row in 0..chroma_height {
        for column in 0..chroma_width {
            let mut red = 0u32;
            let mut green = 0u32;
            let mut blue = 0u32;
            let mut count = 0u32;
            for y_row in (row * 2)..(row * 2 + 2).min(height) {
                for x in (column * 2)..(column * 2 + 2).min(width) {
                    let offset = y_row * stride + x * 3;
                    red += rgb[offset] as u32;
                    green += rgb[offset + 1] as u32;
                    blue += rgb[offset + 2] as u32;
                    count += 1;
                }
            }
            let (_, chroma_u, chroma_v) = rgb_to_yuv(
                (red / count) as u8,
                (green / count) as u8,
                (blue / count) as u8,
            );
            u[row * u_stride + column] = chroma_u;
            v[row * v_stride + column] = chroma_v;
        }
    }
    Ok(())
}

fn open_camera() -> Result<Camera, String> {
    let requested =
        RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestResolution);
    let mut camera = Camera::new(CameraIndex::Index(CAMERA_INDEX), requested)
        .map_err(|error| format!("failed to create Media Foundation camera: {error}"))?;
    camera
        .open_stream()
        .map_err(|error| format!("failed to open Media Foundation camera: {error}"))?;
    Ok(camera)
}

fn spawn_capture_worker(
    slot: Arc<LatestFrame>,
    failure_tx: tokio_mpsc::UnboundedSender<CameraFailure>,
) -> (oneshot::Receiver<Result<(u32, u32), String>>, Worker) {
    let (ready_tx, ready_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = mpsc::channel();
    let thread = thread::spawn(move || {
        let mut camera = match open_camera() {
            Ok(camera) => camera,
            Err(error) => {
                let _ = ready_tx.send(Err(error));
                return;
            }
        };
        let resolution = camera.resolution();
        if ready_tx.send(Ok((resolution.x(), resolution.y()))).is_err() {
            return;
        }
        loop {
            match stop_rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => break,
                Err(mpsc::TryRecvError::Empty) => {}
            }
            let buffer = match camera.frame() {
                Ok(buffer) => buffer,
                Err(_) => {
                    let _ = failure_tx.send(CameraFailure::Camera);
                    break;
                }
            };
            let image = match buffer.decode_image::<RgbFormat>() {
                Ok(image) => image,
                Err(_) => {
                    let _ = failure_tx.send(CameraFailure::Camera);
                    break;
                }
            };
            let width = image.width();
            let height = image.height();
            slot.replace(CameraFrame {
                width,
                height,
                stride: width as usize * 3,
                data: image.into_raw(),
            });
        }
    });
    (
        ready_rx,
        Worker {
            stop: stop_tx,
            thread: Some(thread),
        },
    )
}

fn spawn_video_worker(
    source: NativeVideoSource,
    slot: Arc<LatestFrame>,
    failure_tx: tokio_mpsc::UnboundedSender<CameraFailure>,
) -> Worker {
    let (stop_tx, stop_rx) = mpsc::channel();
    let thread = thread::spawn(move || loop {
        match stop_rx.recv_timeout(Duration::from_millis(1000 / CAMERA_FPS as u64)) {
            Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        let Some(frame) = slot.take() else { continue };
        let mut i420 = I420Buffer::new(frame.width, frame.height);
        let (y_stride, u_stride, v_stride) = i420.strides();
        let (y, u, v) = i420.data_mut();
        if rgb24_to_i420(
            &frame.data,
            frame.stride,
            frame.width as usize,
            frame.height as usize,
            y,
            y_stride as usize,
            u,
            u_stride as usize,
            v,
            v_stride as usize,
        )
        .is_err()
        {
            let _ = failure_tx.send(CameraFailure::Video);
            break;
        }
        source.capture_frame(&VideoFrame::new(VideoRotation::VideoRotation0, i420));
    });
    Worker {
        stop: stop_tx,
        thread: Some(thread),
    }
}

pub(crate) struct CameraSession {
    worker: Option<Worker>,
    video_worker: Option<Worker>,
    _source: NativeVideoSource,
    stopped: bool,
}

impl CameraSession {
    pub(crate) async fn start(
        room: &Room,
    ) -> Result<(Self, tokio_mpsc::UnboundedReceiver<CameraFailure>), String> {
        let slot = Arc::new(LatestFrame::new());
        let (failure_tx, failure_rx) = tokio_mpsc::unbounded_channel();
        let (ready_rx, worker) = spawn_capture_worker(slot.clone(), failure_tx.clone());
        let (width, height) = match ready_rx.await {
            Ok(Ok(resolution)) => resolution,
            Ok(Err(error)) => {
                worker.stop_and_join().await;
                return Err(error);
            }
            Err(_) => {
                worker.stop_and_join().await;
                return Err("camera startup thread ended unexpectedly".to_owned());
            }
        };
        let source = NativeVideoSource::new(VideoResolution { width, height }, false);
        let track =
            LocalVideoTrack::create_video_track("camera", RtcVideoSource::Native(source.clone()));
        if let Err(error) = room
            .local_participant()
            .publish_track(
                LocalTrack::Video(track),
                TrackPublishOptions {
                    source: TrackSource::Camera,
                    ..Default::default()
                },
            )
            .await
        {
            worker.stop_and_join().await;
            return Err(format!("failed to publish camera track: {error}"));
        }
        let video_worker = spawn_video_worker(source.clone(), slot, failure_tx);
        Ok((
            Self {
                worker: Some(worker),
                video_worker: Some(video_worker),
                _source: source,
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
        if let Some(video_worker) = self.video_worker.take() {
            video_worker.stop_and_join().await;
        }
        if let Some(worker) = self.worker.take() {
            worker.stop_and_join().await;
        }
    }
}

impl Drop for CameraSession {
    fn drop(&mut self) {
        if let Some(worker) = &self.worker {
            worker.signal_stop();
        }
        if let Some(video_worker) = &self.video_worker {
            video_worker.signal_stop();
        }
    }
}
