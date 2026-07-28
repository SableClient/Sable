use std::os::fd::{AsRawFd, OwnedFd};

use ashpd::desktop::screencast::{
    CursorMode, Screencast, SelectSourcesOptions, SourceType, Stream,
};
use ashpd::desktop::{PersistMode, Session};
use futures_util::StreamExt;
use gstreamer as gst;
use gstreamer::prelude::*;
use gstreamer_app as gst_app;
use gstreamer_video as gst_video;
use gstreamer_video::prelude::*;
use livekit::options::TrackPublishOptions;
use livekit::track::{LocalTrack, LocalVideoTrack, TrackSource};
use livekit::webrtc::video_frame::{I420Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_source::{RtcVideoSource, VideoResolution};
use livekit::Room;
use tokio::sync::{mpsc, oneshot};

#[derive(Debug, Clone, Copy)]
pub(crate) enum ScreenShareFailure {
    Portal,
    Capture,
}

pub(crate) struct ScreenShareSession {
    pipeline: gst::Pipeline,
    _proxy: Screencast,
    _stream: Stream,
    _remote_fd: OwnedFd,
    failure_tx: mpsc::UnboundedSender<ScreenShareFailure>,
    monitor_stop: Option<oneshot::Sender<()>>,
    monitor_task: Option<tokio::task::JoinHandle<()>>,
    stopped: bool,
}

async fn startup_failure<T>(session: &Session<Screencast>, error: String) -> Result<T, String> {
    let _ = session.close().await;
    Err(error)
}

async fn pipeline_startup_failure<T>(
    session: &Session<Screencast>,
    pipeline: &gst::Pipeline,
    error: String,
) -> Result<T, String> {
    let _ = pipeline.set_state(gst::State::Null);
    startup_failure(session, error).await
}

async fn monitor_session(
    session: Session<Screencast>,
    bus: gst::Bus,
    monitor_stop_rx: oneshot::Receiver<()>,
    failure_tx: mpsc::UnboundedSender<ScreenShareFailure>,
) {
    let mut portal_closed = match session.receive_closed().await {
        Ok(stream) => stream,
        Err(_) => {
            let _ = failure_tx.send(ScreenShareFailure::Portal);
            let _ = session.close().await;
            return;
        }
    };
    let mut bus_stream = bus.stream();
    tokio::pin!(monitor_stop_rx);
    loop {
        tokio::select! {
            _ = &mut monitor_stop_rx => break,
            _ = portal_closed.next() => {
                let _ = failure_tx.send(ScreenShareFailure::Portal);
                break;
            }
            message = bus_stream.next() => {
                match message {
                    Some(message) => match message.view() {
                        gst::MessageView::Error(_) | gst::MessageView::Eos(_) => {
                            let _ = failure_tx.send(ScreenShareFailure::Capture);
                            break;
                        }
                        _ => {}
                    },
                    None => {
                        let _ = failure_tx.send(ScreenShareFailure::Capture);
                        break;
                    }
                }
            }
        }
    }
    let _ = session.close().await;
}

impl ScreenShareSession {
    pub(crate) async fn start(
        room: &Room,
    ) -> Result<(Self, mpsc::UnboundedReceiver<ScreenShareFailure>), String> {
        let proxy = Screencast::new()
            .await
            .map_err(|error| format!("failed to create screen-share portal proxy: {error}"))?;
        let session = proxy
            .create_session(Default::default())
            .await
            .map_err(|error| format!("failed to create screen-share portal session: {error}"))?;
        if let Err(error) = proxy
            .select_sources(
                &session,
                SelectSourcesOptions::default()
                    .set_cursor_mode(CursorMode::Embedded)
                    .set_sources(SourceType::Monitor | SourceType::Window)
                    .set_multiple(false)
                    .set_persist_mode(PersistMode::DoNot),
            )
            .await
        {
            return startup_failure(
                &session,
                format!("failed to select screen-share portal source: {error}"),
            )
            .await;
        }

        let response = match proxy.start(&session, None, Default::default()).await {
            Ok(response) => match response.response() {
                Ok(response) => response,
                Err(error) => {
                    return startup_failure(
                        &session,
                        format!("screen-share portal returned an invalid start response: {error}"),
                    )
                    .await;
                }
            },
            Err(error) => {
                return startup_failure(
                    &session,
                    format!("failed to start screen-share portal session: {error}"),
                )
                .await;
            }
        };
        if response.streams().len() != 1 {
            return startup_failure(
                &session,
                format!(
                    "screen-share portal returned {} streams; expected exactly one",
                    response.streams().len()
                ),
            )
            .await;
        }
        let stream = response.streams()[0].clone();
        let remote_fd = match proxy
            .open_pipe_wire_remote(&session, Default::default())
            .await
        {
            Ok(remote_fd) => remote_fd,
            Err(error) => {
                return startup_failure(
                    &session,
                    format!("failed to open screen-share PipeWire remote: {error}"),
                )
                .await;
            }
        };

        if let Err(error) = gst::init() {
            return startup_failure(&session, format!("failed to initialize GStreamer: {error}"))
                .await;
        }
        let pipewire = match gst::ElementFactory::make("pipewiresrc")
            .property("fd", remote_fd.as_raw_fd())
            .property("path", stream.pipe_wire_node_id().to_string())
            .build()
        {
            Ok(pipewire) => pipewire,
            Err(error) => {
                return startup_failure(
                    &session,
                    format!("failed to create screen-share pipewiresrc: {error}"),
                )
                .await;
            }
        };
        let convert = match gst::ElementFactory::make("videoconvert").build() {
            Ok(convert) => convert,
            Err(error) => {
                return startup_failure(
                    &session,
                    format!("failed to create screen-share videoconvert: {error}"),
                )
                .await;
            }
        };
        let caps = gst::Caps::builder("video/x-raw")
            .field("format", "I420")
            .build();
        let caps_filter = match gst::ElementFactory::make("capsfilter")
            .property("caps", &caps)
            .build()
        {
            Ok(caps_filter) => caps_filter,
            Err(error) => {
                return startup_failure(
                    &session,
                    format!("failed to create screen-share I420 caps: {error}"),
                )
                .await;
            }
        };
        let sink = match gst::ElementFactory::make("appsink")
            .name("screen_sink")
            .property("max-buffers", 1u32)
            .property("drop", true)
            .property("sync", false)
            .build()
        {
            Ok(sink) => match sink.downcast::<gst_app::AppSink>() {
                Ok(sink) => sink,
                Err(_) => {
                    return startup_failure(
                        &session,
                        "screen-share appsink has the wrong type".to_string(),
                    )
                    .await;
                }
            },
            Err(error) => {
                return startup_failure(
                    &session,
                    format!("failed to create screen-share appsink: {error}"),
                )
                .await;
            }
        };

        let (width, height) = stream.size().unwrap_or((1280, 720));
        let source = NativeVideoSource::new(
            VideoResolution {
                width: width.max(1) as u32,
                height: height.max(1) as u32,
            },
            true,
        );
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
            return startup_failure(
                &session,
                format!("failed to publish screen-share track: {error}"),
            )
            .await;
        }

        let pipeline = gst::Pipeline::default();
        if let Err(error) =
            pipeline.add_many([&pipewire, &convert, &caps_filter, sink.upcast_ref()])
        {
            return pipeline_startup_failure(
                &session,
                &pipeline,
                format!("failed to assemble screen-share pipeline: {error}"),
            )
            .await;
        }
        if let Err(error) =
            gst::Element::link_many([&pipewire, &convert, &caps_filter, sink.upcast_ref()])
        {
            return pipeline_startup_failure(
                &session,
                &pipeline,
                format!("failed to link screen-share pipeline: {error}"),
            )
            .await;
        }

        let (failure_tx, failure_rx) = mpsc::unbounded_channel();
        let callback_failure_tx = failure_tx.clone();
        sink.set_callbacks(
            gst_app::AppSinkCallbacks::builder()
                .new_sample(move |sink| {
                    let result = (|| {
                        let sample = sink.pull_sample().map_err(|_| gst::FlowError::Eos)?;
                        let buffer = sample.buffer().ok_or(gst::FlowError::Error)?;
                        let caps = sample.caps().ok_or(gst::FlowError::NotNegotiated)?;
                        let info = gst_video::VideoInfo::from_caps(caps)
                            .map_err(|_| gst::FlowError::NotNegotiated)?;
                        let frame =
                            gst_video::VideoFrameRef::from_buffer_ref_readable(buffer, &info)
                                .map_err(|_| gst::FlowError::Error)?;
                        let width = info.width();
                        let height = info.height();
                        let planes = frame.planes_data();
                        let strides = frame.plane_stride();
                        if planes.len() < 3 || strides.len() < 3 {
                            return Err(gst::FlowError::Error);
                        }
                        let mut i420 = I420Buffer::new(width, height);
                        let (destination_y, destination_u, destination_v) = i420.data_mut();
                        copy_plane(
                            planes[0],
                            strides[0],
                            destination_y,
                            width as usize,
                            width as usize,
                            height as usize,
                        )
                        .map_err(|_| gst::FlowError::Error)?;
                        copy_plane(
                            planes[1],
                            strides[1],
                            destination_u,
                            width.div_ceil(2) as usize,
                            width.div_ceil(2) as usize,
                            height.div_ceil(2) as usize,
                        )
                        .map_err(|_| gst::FlowError::Error)?;
                        copy_plane(
                            planes[2],
                            strides[2],
                            destination_v,
                            width.div_ceil(2) as usize,
                            width.div_ceil(2) as usize,
                            height.div_ceil(2) as usize,
                        )
                        .map_err(|_| gst::FlowError::Error)?;
                        source.capture_frame(&VideoFrame::new(VideoRotation::VideoRotation0, i420));
                        Ok::<_, gst::FlowError>(())
                    })();
                    match result {
                        Ok(()) => Ok(gst::FlowSuccess::Ok),
                        Err(error) => {
                            let _ = callback_failure_tx.send(ScreenShareFailure::Capture);
                            Err(error)
                        }
                    }
                })
                .build(),
        );
        if let Err(error) = pipeline.set_state(gst::State::Playing) {
            return pipeline_startup_failure(
                &session,
                &pipeline,
                format!("failed to start screen-share GStreamer pipeline: {error}"),
            )
            .await;
        }

        let bus = match pipeline.bus() {
            Some(bus) => bus,
            None => {
                return pipeline_startup_failure(
                    &session,
                    &pipeline,
                    "screen-share GStreamer pipeline has no bus".to_string(),
                )
                .await;
            }
        };
        let (monitor_stop, monitor_stop_rx) = oneshot::channel();
        let monitor_failure_tx = failure_tx.clone();
        let monitor_task = tokio::spawn(monitor_session(
            session,
            bus,
            monitor_stop_rx,
            monitor_failure_tx,
        ));

        Ok((
            Self {
                pipeline,
                _proxy: proxy,
                _stream: stream,
                _remote_fd: remote_fd,
                failure_tx,
                monitor_stop: Some(monitor_stop),
                monitor_task: Some(monitor_task),
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
        if let Some(stop) = self.monitor_stop.take() {
            let _ = stop.send(());
        }
        if let Some(task) = self.monitor_task.take() {
            let _ = task.await;
        }
        if self.pipeline.set_state(gst::State::Null).is_err() {
            let _ = self.failure_tx.send(ScreenShareFailure::Capture);
        }
    }
}

impl Drop for ScreenShareSession {
    fn drop(&mut self) {
        if let Some(stop) = self.monitor_stop.take() {
            let _ = stop.send(());
        }
        if let Some(task) = self.monitor_task.take() {
            task.abort();
        }
        let _ = self.pipeline.set_state(gst::State::Null);
    }
}

fn copy_plane(
    source: &[u8],
    source_stride: i32,
    destination: &mut [u8],
    destination_stride: usize,
    width: usize,
    height: usize,
) -> Result<(), ()> {
    let source_stride = usize::try_from(source_stride).map_err(|_| ())?;
    if source_stride == 0
        || destination_stride == 0
        || source_stride < width
        || destination_stride < width
    {
        return Err(());
    }
    if width == 0 || height == 0 {
        return Ok(());
    }
    let source_end = height
        .checked_sub(1)
        .and_then(|last_row| last_row.checked_mul(source_stride))
        .and_then(|last_start| last_start.checked_add(width))
        .ok_or(())?;
    let destination_end = height
        .checked_sub(1)
        .and_then(|last_row| last_row.checked_mul(destination_stride))
        .and_then(|last_start| last_start.checked_add(width))
        .ok_or(())?;
    if source_end > source.len() || destination_end > destination.len() {
        return Err(());
    }
    for row in 0..height {
        let source_start = row.checked_mul(source_stride).ok_or(())?;
        let destination_start = row.checked_mul(destination_stride).ok_or(())?;
        let source_end = source_start.checked_add(width).ok_or(())?;
        let destination_end = destination_start.checked_add(width).ok_or(())?;
        destination[destination_start..destination_end]
            .copy_from_slice(&source[source_start..source_end]);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::copy_plane;

    #[test]
    fn copy_plane_respects_padded_source_stride() {
        let source = [1, 2, 9, 9, 3, 4, 8, 8];
        let mut destination = [0; 4];

        copy_plane(&source, 4, &mut destination, 2, 2, 2).unwrap();

        assert_eq!(destination, [1, 2, 3, 4]);
    }

    #[test]
    fn copy_plane_rejects_invalid_stride_and_ranges() {
        let source = [1, 2, 3, 4];
        let mut destination = [0; 4];

        assert!(copy_plane(&source, -1, &mut destination, 2, 2, 2).is_err());
        assert!(copy_plane(&source, 0, &mut destination, 2, 0, 0).is_err());
        assert!(copy_plane(&source, 2, &mut destination, 0, 0, 0).is_err());
        assert!(copy_plane(&source, 1, &mut destination, 2, 2, 2).is_err());
        assert!(copy_plane(&source, 2, &mut destination, 2, 2, 3).is_err());
        assert!(copy_plane(&source, 2, &mut [0; 2], 2, 2, 2).is_err());
        assert!(copy_plane(&source, i32::MAX, &mut destination, 2, 2, usize::MAX).is_err());
    }
}
