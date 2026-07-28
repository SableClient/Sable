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
use nokhwa::utils::{
    CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType, Resolution,
};
use nokhwa::Camera;
use tokio::sync::{mpsc as tokio_mpsc, oneshot, watch};

const CAMERA_INDEX: u32 = 0;
const CAMERA_WIDTH: u32 = 1280;
const CAMERA_HEIGHT: u32 = 720;
const CAMERA_FPS: u32 = 30;
const FALLBACK_WIDTH: u32 = 640;
const FALLBACK_HEIGHT: u32 = 480;

#[derive(Debug, Clone, Copy)]
pub(crate) enum CameraFailure {
    Camera,
    Video,
}

#[derive(Debug)]
struct CameraFrame {
    width: u32,
    height: u32,
    stride: usize,
    data: Vec<u8>,
}

struct LatestFrame {
    frame: Mutex<Option<CameraFrame>>,
}

impl LatestFrame {
    fn new() -> Self {
        Self {
            frame: Mutex::new(None),
        }
    }

    fn replace(&self, frame: CameraFrame) {
        *self.frame.lock().unwrap() = Some(frame);
    }

    fn take(&self) -> Option<CameraFrame> {
        self.frame.lock().unwrap().take()
    }
}

struct CameraWorker {
    stop: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}

struct VideoWorker {
    stop: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}

impl CameraWorker {
    async fn stop_and_join(mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() {
            let _ = tokio::task::spawn_blocking(move || {
                let _ = thread.join();
            })
            .await;
        }
    }
}

impl VideoWorker {
    async fn stop_and_join(mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() {
            let _ = tokio::task::spawn_blocking(move || {
                let _ = thread.join();
            })
            .await;
        }
    }
}

fn rgb_to_yuv(red: u8, green: u8, blue: u8) -> (u8, u8, u8) {
    let red = red as i32;
    let green = green as i32;
    let blue = blue as i32;
    let y = ((66 * red + 129 * green + 25 * blue + 128) >> 8) + 16;
    let u = ((-38 * red - 74 * green + 112 * blue + 128) >> 8) + 128;
    let v = ((112 * red - 94 * green - 18 * blue + 128) >> 8) + 128;
    (
        y.clamp(0, 255) as u8,
        u.clamp(0, 255) as u8,
        v.clamp(0, 255) as u8,
    )
}

fn rgb24_to_i420(
    rgb: &[u8],
    rgb_stride: usize,
    width: usize,
    height: usize,
    y_plane: &mut [u8],
    y_stride: usize,
    u_plane: &mut [u8],
    u_stride: usize,
    v_plane: &mut [u8],
    v_stride: usize,
) -> Result<(), String> {
    if width == 0 || height == 0 || rgb_stride < width.saturating_mul(3) {
        return Err("invalid RGB24 layout".to_owned());
    }
    if rgb.len() < rgb_stride.saturating_mul(height) {
        return Err("RGB24 buffer is smaller than its declared layout".to_owned());
    }
    let chroma_width = width.div_ceil(2);
    let chroma_height = height.div_ceil(2);
    if y_stride < width
        || u_stride < chroma_width
        || v_stride < chroma_width
        || y_plane.len() < y_stride.saturating_mul(height)
        || u_plane.len() < u_stride.saturating_mul(chroma_height)
        || v_plane.len() < v_stride.saturating_mul(chroma_height)
    {
        return Err("I420 planes are smaller than their declared layout".to_owned());
    }

    for row in 0..height {
        for column in 0..width {
            let source = row * rgb_stride + column * 3;
            let (luma, _, _) = rgb_to_yuv(rgb[source], rgb[source + 1], rgb[source + 2]);
            y_plane[row * y_stride + column] = luma;
        }
    }

    for row in 0..chroma_height {
        for column in 0..chroma_width {
            let mut red = 0u32;
            let mut green = 0u32;
            let mut blue = 0u32;
            let mut count = 0u32;
            for y in (row * 2)..((row * 2 + 2).min(height)) {
                for x in (column * 2)..((column * 2 + 2).min(width)) {
                    let source = y * rgb_stride + x * 3;
                    red += rgb[source] as u32;
                    green += rgb[source + 1] as u32;
                    blue += rgb[source + 2] as u32;
                    count += 1;
                }
            }
            let (_, u, v) = rgb_to_yuv(
                (red / count) as u8,
                (green / count) as u8,
                (blue / count) as u8,
            );
            u_plane[row * u_stride + column] = u;
            v_plane[row * v_stride + column] = v;
        }
    }
    Ok(())
}

fn open_camera() -> Result<Camera, String> {
    let index = CameraIndex::Index(CAMERA_INDEX);
    let formats = [
        FrameFormat::MJPEG,
        FrameFormat::YUYV,
        FrameFormat::RAWRGB,
        FrameFormat::RAWBGR,
    ];
    let resolutions = [
        Resolution::new(CAMERA_WIDTH, CAMERA_HEIGHT),
        Resolution::new(FALLBACK_WIDTH, FALLBACK_HEIGHT),
    ];
    let mut last_error = String::from("no compatible V4L2 camera format");
    for resolution in resolutions {
        for format in formats {
            let requested = RequestedFormat::new::<RgbFormat>(RequestedFormatType::Exact(
                CameraFormat::new_from(resolution.x(), resolution.y(), format, CAMERA_FPS),
            ));
            match Camera::new(index.clone(), requested) {
                Ok(mut camera) => match camera.open_stream() {
                    Ok(()) => return Ok(camera),
                    Err(error) => last_error = error.to_string(),
                },
                Err(error) => last_error = error.to_string(),
            }
        }
    }
    Err(format!("failed to open V4L2 camera 0: {last_error}"))
}

fn spawn_camera_worker(
    slot: Arc<LatestFrame>,
    failure_tx: tokio_mpsc::UnboundedSender<CameraFailure>,
) -> (oneshot::Receiver<Result<(u32, u32), String>>, CameraWorker) {
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
            if stop_rx.try_recv().is_ok() {
                break;
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
        CameraWorker {
            stop: stop_tx,
            thread: Some(thread),
        },
    )
}

fn spawn_video_worker(
    source: NativeVideoSource,
    slot: Arc<LatestFrame>,
    failure_tx: tokio_mpsc::UnboundedSender<CameraFailure>,
) -> VideoWorker {
    let (stop_tx, stop_rx) = mpsc::channel();
    let thread = thread::spawn(move || loop {
        match stop_rx.recv_timeout(Duration::from_millis(1000 / CAMERA_FPS as u64)) {
            Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        let Some(frame) = slot.take() else { continue };
        let mut i420 = I420Buffer::new(frame.width, frame.height);
        let (y_stride, u_stride, v_stride) = i420.strides();
        let (y_plane, u_plane, v_plane) = i420.data_mut();
        if rgb24_to_i420(
            &frame.data,
            frame.stride,
            frame.width as usize,
            frame.height as usize,
            y_plane,
            y_stride as usize,
            u_plane,
            u_stride as usize,
            v_plane,
            v_stride as usize,
        )
        .is_err()
        {
            let _ = failure_tx.send(CameraFailure::Video);
            break;
        }
        source.capture_frame(&VideoFrame::new(VideoRotation::VideoRotation0, i420));
    });
    VideoWorker {
        stop: stop_tx,
        thread: Some(thread),
    }
}

pub(crate) struct CameraSession {
    cancellation: watch::Sender<bool>,
    worker: Option<CameraWorker>,
    video_worker: Option<VideoWorker>,
    _source: NativeVideoSource,
    stopped: bool,
    #[cfg(test)]
    shutdown_marker: Option<Arc<Mutex<Vec<&'static str>>>>,
}

impl CameraSession {
    pub(crate) async fn start(
        room: &Room,
    ) -> Result<(Self, tokio_mpsc::UnboundedReceiver<CameraFailure>), String> {
        let slot = Arc::new(LatestFrame::new());
        let (failure_tx, failure_rx) = tokio_mpsc::unbounded_channel();
        let (ready_rx, worker) = spawn_camera_worker(slot.clone(), failure_tx.clone());
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
        let (cancellation, _) = watch::channel(false);
        let video_worker = spawn_video_worker(source.clone(), slot, failure_tx);
        Ok((
            Self {
                cancellation,
                worker: Some(worker),
                video_worker: Some(video_worker),
                _source: source,
                stopped: false,
                #[cfg(test)]
                shutdown_marker: None,
            },
            failure_rx,
        ))
    }

    pub(crate) async fn shutdown(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        #[cfg(test)]
        if let Some(marker) = &self.shutdown_marker {
            marker.lock().unwrap().push("camera");
        }
        let _ = self.cancellation.send(true);
        if let Some(video_worker) = self.video_worker.take() {
            video_worker.stop_and_join().await;
        }
        if let Some(worker) = self.worker.take() {
            worker.stop_and_join().await;
        }
    }

    #[cfg(test)]
    pub(crate) fn without_devices(shutdown_marker: Option<Arc<Mutex<Vec<&'static str>>>>) -> Self {
        let (cancellation, _) = watch::channel(false);
        Self {
            cancellation,
            worker: None,
            video_worker: None,
            _source: NativeVideoSource::new(
                VideoResolution {
                    width: CAMERA_WIDTH,
                    height: CAMERA_HEIGHT,
                },
                false,
            ),
            stopped: false,
            shutdown_marker,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{rgb24_to_i420, spawn_video_worker, CameraSession, LatestFrame};
    use livekit::webrtc::video_source::native::NativeVideoSource;
    use livekit::webrtc::video_source::VideoResolution;
    use std::sync::{Arc, Mutex};

    #[test]
    fn rgb24_conversion_respects_source_stride_and_i420_layout() {
        let rgb = [
            255, 0, 0, 0, 255, 0, 9, 9, 9, 0, 0, 255, 255, 255, 255, 7, 7, 7,
        ];
        let mut y = [0; 8];
        let mut u = [0; 2];
        let mut v = [0; 2];
        rgb24_to_i420(&rgb, 9, 2, 2, &mut y, 4, &mut u, 2, &mut v, 2).unwrap();
        assert_eq!(&y[..2], &[82, 144]);
        assert_eq!(y[4], 41);
        assert!(u[0] > 100 && u[0] < 200);
        assert!(v[0] > 100 && v[0] < 200);
    }

    #[tokio::test]
    async fn camera_shutdown_is_idempotent_without_a_device() {
        let marker = Arc::new(Mutex::new(Vec::new()));
        let mut session = CameraSession::without_devices(Some(marker.clone()));
        session.shutdown().await;
        session.shutdown().await;
        assert_eq!(&*marker.lock().unwrap(), &["camera"]);
    }

    #[tokio::test]
    async fn blocking_video_worker_shutdown_does_not_require_a_device() {
        let (failure_tx, _failure_rx) = tokio::sync::mpsc::unbounded_channel();
        let worker = spawn_video_worker(
            NativeVideoSource::new(
                VideoResolution {
                    width: 2,
                    height: 2,
                },
                false,
            ),
            std::sync::Arc::new(LatestFrame::new()),
            failure_tx,
        );
        worker.stop_and_join().await;
    }
}
