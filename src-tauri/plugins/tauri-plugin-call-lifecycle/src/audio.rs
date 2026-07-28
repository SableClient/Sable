use std::collections::VecDeque;
use std::sync::mpsc;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, StreamConfig};
use futures_util::StreamExt;
use livekit::options::TrackPublishOptions;
use livekit::track::{LocalAudioTrack, LocalTrack, RemoteAudioTrack, TrackSource};
use livekit::webrtc::audio_frame::AudioFrame;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use livekit::webrtc::audio_source::{AudioSourceOptions, RtcAudioSource};
use livekit::webrtc::audio_stream::native::NativeAudioStream;
use livekit::Room;
use tauri::async_runtime;
use tokio::sync::{mpsc as tokio_mpsc, oneshot, watch};

pub(crate) const SAMPLE_RATE: u32 = 48_000;
pub(crate) const CHANNELS: u32 = 1;
pub(crate) const AUDIO_FRAME_SAMPLES: usize = 480;
const AUDIO_QUEUE_CAPACITY: usize = 32;
const PLAYBACK_QUEUE_CAPACITY: usize = 2;

type AudioFrameSamples = [i16; AUDIO_FRAME_SAMPLES];

struct CpalThread {
    stop: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}

impl CpalThread {
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

fn supported_format_rank(format: SampleFormat) -> Option<u8> {
    match format {
        SampleFormat::I16 => Some(0),
        SampleFormat::F32 => Some(1),
        SampleFormat::U16 => Some(2),
        _ => None,
    }
}

fn select_input_config(device: &cpal::Device) -> Result<(StreamConfig, SampleFormat), String> {
    let mut ranges: Vec<_> = device
        .supported_input_configs()
        .map_err(|error| format!("failed to query microphone configs: {error}"))?
        .filter(|range| {
            (range.channels() == 1 || range.channels() == 2)
                && range.min_sample_rate() <= SampleRate(SAMPLE_RATE)
                && SampleRate(SAMPLE_RATE) <= range.max_sample_rate()
                && supported_format_rank(range.sample_format()).is_some()
        })
        .collect();
    ranges.sort_by_key(|range| {
        (
            range.channels() != CHANNELS as u16,
            supported_format_rank(range.sample_format()).unwrap(),
        )
    });
    ranges
        .into_iter()
        .find_map(|range| {
            range
                .try_with_sample_rate(SampleRate(SAMPLE_RATE))
                .map(|config| (config.config(), config.sample_format()))
        })
        .ok_or_else(|| "microphone has no compatible 48 kHz mono/stereo config".to_owned())
}

fn select_output_config(device: &cpal::Device) -> Result<(StreamConfig, SampleFormat), String> {
    let mut ranges: Vec<_> = device
        .supported_output_configs()
        .map_err(|error| format!("failed to query speaker configs: {error}"))?
        .filter(|range| {
            (range.channels() == 1 || range.channels() == 2)
                && range.min_sample_rate() <= SampleRate(SAMPLE_RATE)
                && SampleRate(SAMPLE_RATE) <= range.max_sample_rate()
                && supported_format_rank(range.sample_format()).is_some()
        })
        .collect();
    ranges.sort_by_key(|range| {
        (
            range.channels() != 1,
            supported_format_rank(range.sample_format()).unwrap(),
        )
    });
    ranges
        .into_iter()
        .find_map(|range| {
            range
                .try_with_sample_rate(SampleRate(SAMPLE_RATE))
                .map(|config| (config.config(), config.sample_format()))
        })
        .ok_or_else(|| "speaker has no compatible 48 kHz mono/stereo config".to_owned())
}

fn f32_to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * 32_767.0) as i16
}

fn u16_to_i16(sample: u16) -> i16 {
    (sample as i32 - 32_768) as i16
}

fn i16_to_f32(sample: i16) -> f32 {
    sample as f32 / 32_768.0
}

fn i16_to_u16(sample: i16) -> u16 {
    (sample as i32 + 32_768) as u16
}

struct PlaybackQueue {
    frames: Mutex<VecDeque<AudioFrameSamples>>,
    capacity: usize,
}

impl PlaybackQueue {
    fn new(capacity: usize) -> Self {
        Self {
            frames: Mutex::new(VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    fn push_latest(&self, frame: AudioFrameSamples) {
        let mut frames = self.frames.lock().unwrap();
        if frames.len() >= self.capacity {
            frames.pop_front();
        }
        frames.push_back(frame);
    }

    fn pop_newest_nonblocking(&self) -> Option<AudioFrameSamples> {
        self.frames.try_lock().ok().and_then(|mut frames| {
            let newest = frames.pop_back();
            frames.clear();
            newest
        })
    }

    fn clear(&self) {
        self.frames.lock().unwrap().clear();
    }

    #[cfg(test)]
    fn len_nonblocking(&self) -> Option<usize> {
        self.frames.try_lock().ok().map(|frames| frames.len())
    }
}

struct TrackSlot {
    latest: Mutex<Option<AudioFrameSamples>>,
    ended: AtomicBool,
}

impl TrackSlot {
    fn new() -> Self {
        Self {
            latest: Mutex::new(None),
            ended: AtomicBool::new(false),
        }
    }

    fn mark_ended(&self) {
        self.ended.store(true, Ordering::Release);
    }

    fn replace_latest(&self, frame: AudioFrameSamples) {
        *self.latest.lock().unwrap() = Some(frame);
    }

    fn take_latest(&self) -> Option<AudioFrameSamples> {
        self.latest.lock().unwrap().take()
    }
}

fn prune_ended_slots(slots: &mut Vec<Arc<TrackSlot>>) {
    slots.retain(|slot| !slot.ended.load(Ordering::Acquire));
}

struct TrackEndGuard(Arc<TrackSlot>);

impl Drop for TrackEndGuard {
    fn drop(&mut self) {
        self.0.mark_ended();
    }
}

fn mix_latest_frames(slots: &[Arc<TrackSlot>]) -> Option<AudioFrameSamples> {
    let mut mixed = [0i32; AUDIO_FRAME_SAMPLES];
    let mut tracks = 0;
    for slot in slots {
        let Some(frame) = slot.take_latest() else {
            continue;
        };
        tracks += 1;
        for (sum, sample) in mixed.iter_mut().zip(frame) {
            *sum += sample as i32;
        }
    }
    (tracks > 0).then(|| mixed.map(|sample| sample.clamp(i16::MIN as i32, i16::MAX as i32) as i16))
}

fn enqueue_input_samples<T: Copy>(
    data: &[T],
    channels: usize,
    pending: &mut AudioFrameSamples,
    pending_len: &mut usize,
    sender: &tokio_mpsc::Sender<AudioFrameSamples>,
    convert: fn(T) -> i16,
) {
    for input_frame in data.chunks_exact(channels) {
        let sample = if channels == 1 {
            convert(input_frame[0])
        } else {
            let left = convert(input_frame[0]) as i32;
            let right = convert(input_frame[1]) as i32;
            ((left + right) / 2).clamp(i16::MIN as i32, i16::MAX as i32) as i16
        };
        pending[*pending_len] = sample;
        *pending_len += 1;
        if *pending_len != AUDIO_FRAME_SAMPLES {
            continue;
        }

        let frame = *pending;
        *pending_len = 0;
        match sender.try_send(frame) {
            Ok(()) | Err(tokio_mpsc::error::TrySendError::Full(_)) => {}
            Err(tokio_mpsc::error::TrySendError::Closed(_)) => return,
        }
    }
}

fn build_input_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    format: SampleFormat,
    sender: tokio_mpsc::Sender<AudioFrameSamples>,
    failure_tx: tokio_mpsc::UnboundedSender<()>,
) -> Result<cpal::Stream, String> {
    let channels = config.channels as usize;
    let stream = match format {
        SampleFormat::I16 => {
            let mut pending = [0; AUDIO_FRAME_SAMPLES];
            let mut pending_len = 0;
            let failure_tx = failure_tx.clone();
            device.build_input_stream(
                config,
                move |data: &[i16], _| {
                    enqueue_input_samples(
                        data,
                        channels,
                        &mut pending,
                        &mut pending_len,
                        &sender,
                        |sample| sample,
                    );
                },
                move |_| {
                    let _ = failure_tx.send(());
                },
                None,
            )
        }
        SampleFormat::F32 => {
            let mut pending = [0; AUDIO_FRAME_SAMPLES];
            let mut pending_len = 0;
            let failure_tx = failure_tx.clone();
            device.build_input_stream(
                config,
                move |data: &[f32], _| {
                    enqueue_input_samples(
                        data,
                        channels,
                        &mut pending,
                        &mut pending_len,
                        &sender,
                        f32_to_i16,
                    );
                },
                move |_| {
                    let _ = failure_tx.send(());
                },
                None,
            )
        }
        SampleFormat::U16 => {
            let mut pending = [0; AUDIO_FRAME_SAMPLES];
            let mut pending_len = 0;
            let failure_tx = failure_tx.clone();
            device.build_input_stream(
                config,
                move |data: &[u16], _| {
                    enqueue_input_samples(
                        data,
                        channels,
                        &mut pending,
                        &mut pending_len,
                        &sender,
                        u16_to_i16,
                    );
                },
                move |_| {
                    let _ = failure_tx.send(());
                },
                None,
            )
        }
        _ => return Err(format!("unsupported microphone sample format: {format}")),
    };
    stream.map_err(|error| format!("failed to build microphone stream: {error}"))
}

fn next_playback_sample(
    queue: &PlaybackQueue,
    current: &mut AudioFrameSamples,
    offset: &mut usize,
) -> i16 {
    loop {
        if *offset < AUDIO_FRAME_SAMPLES {
            let sample = current[*offset];
            *offset += 1;
            return sample;
        }
        match queue.pop_newest_nonblocking() {
            Some(samples) => {
                *current = samples;
                *offset = 0;
            }
            None => return 0,
        }
    }
}

fn fill_output_samples<T: Copy>(
    data: &mut [T],
    channels: usize,
    queue: &PlaybackQueue,
    current: &mut AudioFrameSamples,
    offset: &mut usize,
    convert: fn(i16) -> T,
) {
    for output_frame in data.chunks_mut(channels) {
        let sample = convert(next_playback_sample(queue, current, offset));
        output_frame.fill(sample);
    }
}

fn build_output_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    format: SampleFormat,
    queue: Arc<PlaybackQueue>,
    failure_tx: tokio_mpsc::UnboundedSender<()>,
) -> Result<cpal::Stream, String> {
    let channels = config.channels as usize;
    let stream = match format {
        SampleFormat::I16 => {
            let mut current = [0; AUDIO_FRAME_SAMPLES];
            let mut offset = AUDIO_FRAME_SAMPLES;
            let failure_tx = failure_tx.clone();
            device.build_output_stream(
                config,
                move |data: &mut [i16], _| {
                    fill_output_samples(
                        data,
                        channels,
                        &queue,
                        &mut current,
                        &mut offset,
                        |sample| sample,
                    );
                },
                move |_| {
                    let _ = failure_tx.send(());
                },
                None,
            )
        }
        SampleFormat::F32 => {
            let mut current = [0; AUDIO_FRAME_SAMPLES];
            let mut offset = AUDIO_FRAME_SAMPLES;
            let failure_tx = failure_tx.clone();
            device.build_output_stream(
                config,
                move |data: &mut [f32], _| {
                    fill_output_samples(
                        data,
                        channels,
                        &queue,
                        &mut current,
                        &mut offset,
                        i16_to_f32,
                    );
                },
                move |_| {
                    let _ = failure_tx.send(());
                },
                None,
            )
        }
        SampleFormat::U16 => {
            let mut current = [0; AUDIO_FRAME_SAMPLES];
            let mut offset = AUDIO_FRAME_SAMPLES;
            let failure_tx = failure_tx.clone();
            device.build_output_stream(
                config,
                move |data: &mut [u16], _| {
                    fill_output_samples(
                        data,
                        channels,
                        &queue,
                        &mut current,
                        &mut offset,
                        i16_to_u16,
                    );
                },
                move |_| {
                    let _ = failure_tx.send(());
                },
                None,
            )
        }
        _ => return Err(format!("unsupported speaker sample format: {format}")),
    };
    stream.map_err(|error| format!("failed to build speaker stream: {error}"))
}

fn spawn_input_stream(
    device: cpal::Device,
    config: StreamConfig,
    format: SampleFormat,
    sender: tokio_mpsc::Sender<AudioFrameSamples>,
    failure_tx: tokio_mpsc::UnboundedSender<()>,
) -> (oneshot::Receiver<Result<(), String>>, CpalThread) {
    let (ready_tx, ready_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = mpsc::channel();
    let thread = thread::spawn(move || {
        let stream = match build_input_stream(&device, &config, format, sender, failure_tx) {
            Ok(stream) => stream,
            Err(error) => {
                let _ = ready_tx.send(Err(error));
                return;
            }
        };
        if let Err(error) = stream.play() {
            let _ = ready_tx.send(Err(format!("failed to start microphone stream: {error}")));
            return;
        }
        let _ = ready_tx.send(Ok(()));
        let _ = stop_rx.recv();
        drop(stream);
    });
    (
        ready_rx,
        CpalThread {
            stop: stop_tx,
            thread: Some(thread),
        },
    )
}

fn spawn_output_stream(
    device: cpal::Device,
    config: StreamConfig,
    format: SampleFormat,
    queue: Arc<PlaybackQueue>,
    failure_tx: tokio_mpsc::UnboundedSender<()>,
) -> (oneshot::Receiver<Result<(), String>>, CpalThread) {
    let (ready_tx, ready_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = mpsc::channel();
    let thread = thread::spawn(move || {
        let stream = match build_output_stream(&device, &config, format, queue, failure_tx) {
            Ok(stream) => stream,
            Err(error) => {
                let _ = ready_tx.send(Err(error));
                return;
            }
        };
        if let Err(error) = stream.play() {
            let _ = ready_tx.send(Err(format!("failed to start speaker stream: {error}")));
            return;
        }
        let _ = ready_tx.send(Ok(()));
        let _ = stop_rx.recv();
        drop(stream);
    });
    (
        ready_rx,
        CpalThread {
            stop: stop_tx,
            thread: Some(thread),
        },
    )
}

fn enqueue_track_samples(
    data: &[i16],
    pending: &mut AudioFrameSamples,
    pending_len: &mut usize,
    slot: &TrackSlot,
) {
    for sample in data.iter().copied() {
        pending[*pending_len] = sample;
        *pending_len += 1;
        if *pending_len != AUDIO_FRAME_SAMPLES {
            continue;
        }
        let frame = *pending;
        *pending_len = 0;
        slot.replace_latest(frame);
    }
}

async fn run_remote_track(
    track: RemoteAudioTrack,
    slot: Arc<TrackSlot>,
    mut cancellation: watch::Receiver<bool>,
) {
    let _ended = TrackEndGuard(slot.clone());
    let mut stream = NativeAudioStream::new(track.rtc_track(), SAMPLE_RATE as i32, CHANNELS as i32);
    let mut pending = [0; AUDIO_FRAME_SAMPLES];
    let mut pending_len = 0;
    loop {
        let frame = tokio::select! {
            _ = cancellation.changed() => break,
            frame = stream.next() => {
                let Some(frame) = frame else { break };
                frame
            }
        };
        enqueue_track_samples(frame.data.as_ref(), &mut pending, &mut pending_len, &slot);
    }
}

fn spawn_mixer_task(
    mut track_commands: tokio_mpsc::UnboundedReceiver<RemoteAudioTrack>,
    playback_queue: Arc<PlaybackQueue>,
    mut cancellation: watch::Receiver<bool>,
) -> async_runtime::JoinHandle<()> {
    async_runtime::spawn(async move {
        let mut track_slots = Vec::new();
        let mut track_tasks = tokio::task::JoinSet::new();
        let mut interval = tokio::time::interval(Duration::from_millis(10));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                _ = cancellation.changed() => break,
                track = track_commands.recv() => {
                    let Some(track) = track else { break };
                    let slot = Arc::new(TrackSlot::new());
                    track_slots.push(slot.clone());
                    track_tasks.spawn(run_remote_track(track, slot, cancellation.clone()));
                }
                _ = interval.tick() => {
                    while track_tasks.try_join_next().is_some() {}
                    prune_ended_slots(&mut track_slots);
                    if let Some(frame) = mix_latest_frames(&track_slots) {
                        playback_queue.push_latest(frame);
                    }
                }
            }
        }
        track_tasks.abort_all();
        while track_tasks.join_next().await.is_some() {}
    })
}

fn enqueue_mixer_command<T>(sender: &tokio_mpsc::UnboundedSender<T>, command: T) -> Result<(), ()> {
    sender.send(command).map_err(|_| ())
}

pub(crate) struct AudioSession {
    cancellation: watch::Sender<bool>,
    capture_stream: Option<CpalThread>,
    playback_stream: Option<CpalThread>,
    capture_task: Option<async_runtime::JoinHandle<()>>,
    mixer_task: Option<async_runtime::JoinHandle<()>>,
    mixer_commands: tokio_mpsc::UnboundedSender<RemoteAudioTrack>,
    playback_queue: Arc<PlaybackQueue>,
    _source: NativeAudioSource,
    stopped: bool,
    #[cfg(test)]
    shutdown_marker: Option<Arc<Mutex<Vec<&'static str>>>>,
}

impl AudioSession {
    pub(crate) async fn start(
        room: &Room,
    ) -> Result<(Self, tokio_mpsc::UnboundedReceiver<()>), String> {
        let host = cpal::default_host();
        let input_device = host
            .default_input_device()
            .ok_or_else(|| "no default microphone is available".to_owned())?;
        let output_device = host
            .default_output_device()
            .ok_or_else(|| "no default speaker is available".to_owned())?;
        let (input_config, input_format) = select_input_config(&input_device)?;
        let (output_config, output_format) = select_output_config(&output_device)?;

        let (input_tx, mut input_rx) = tokio_mpsc::channel(AUDIO_QUEUE_CAPACITY);
        let playback_queue = Arc::new(PlaybackQueue::new(PLAYBACK_QUEUE_CAPACITY));
        let (mixer_commands, mixer_command_rx) = tokio_mpsc::unbounded_channel();
        let (cancellation, cancellation_rx) = watch::channel(false);
        let (failure_tx, failure_rx) = tokio_mpsc::unbounded_channel();
        let capture_failure_tx = failure_tx.clone();
        let (input_ready, input_stream) = spawn_input_stream(
            input_device,
            input_config,
            input_format,
            input_tx,
            failure_tx.clone(),
        );
        let input_stream = match input_ready.await {
            Ok(Ok(())) => input_stream,
            Ok(Err(error)) => {
                input_stream.stop_and_join().await;
                return Err(error);
            }
            Err(_) => {
                input_stream.stop_and_join().await;
                return Err("microphone startup thread ended unexpectedly".to_owned());
            }
        };

        let (output_ready, output_stream) = spawn_output_stream(
            output_device,
            output_config,
            output_format,
            playback_queue.clone(),
            failure_tx,
        );
        let output_stream = match output_ready.await {
            Ok(Ok(())) => output_stream,
            Ok(Err(error)) => {
                output_stream.stop_and_join().await;
                input_stream.stop_and_join().await;
                return Err(error);
            }
            Err(_) => {
                output_stream.stop_and_join().await;
                input_stream.stop_and_join().await;
                return Err("speaker startup thread ended unexpectedly".to_owned());
            }
        };

        let source =
            NativeAudioSource::new(AudioSourceOptions::default(), SAMPLE_RATE, CHANNELS, 0);
        let track = LocalAudioTrack::create_audio_track(
            "microphone",
            RtcAudioSource::Native(source.clone()),
        );
        if let Err(error) = room
            .local_participant()
            .publish_track(
                LocalTrack::Audio(track),
                TrackPublishOptions {
                    source: TrackSource::Microphone,
                    ..Default::default()
                },
            )
            .await
        {
            output_stream.stop_and_join().await;
            input_stream.stop_and_join().await;
            return Err(format!("failed to publish microphone track: {error}"));
        }

        let capture_source = source.clone();
        let capture_cancellation = cancellation_rx.clone();
        let capture_task = async_runtime::spawn(async move {
            let mut cancellation = capture_cancellation;
            loop {
                let samples = tokio::select! {
                    _ = cancellation.changed() => break,
                    samples = input_rx.recv() => {
                        let Some(samples) = samples else { break };
                        samples
                    }
                };
                let mut frame = AudioFrame::new(SAMPLE_RATE, CHANNELS, AUDIO_FRAME_SAMPLES as u32);
                frame.data.to_mut().copy_from_slice(&samples);
                if capture_source.capture_frame(&frame).await.is_err() {
                    let _ = capture_failure_tx.send(());
                    break;
                }
            }
        });
        let mixer_task =
            spawn_mixer_task(mixer_command_rx, playback_queue.clone(), cancellation_rx);

        Ok((
            Self {
                cancellation,
                capture_stream: Some(input_stream),
                playback_stream: Some(output_stream),
                capture_task: Some(capture_task),
                mixer_task: Some(mixer_task),
                mixer_commands,
                playback_queue,
                _source: source,
                stopped: false,
                #[cfg(test)]
                shutdown_marker: None,
            },
            failure_rx,
        ))
    }

    pub(crate) fn subscribe_remote_audio(&mut self, track: RemoteAudioTrack) -> Result<(), ()> {
        if self.stopped {
            return Err(());
        }
        enqueue_mixer_command(&self.mixer_commands, track)
    }

    pub(crate) async fn shutdown(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        #[cfg(test)]
        if let Some(marker) = &self.shutdown_marker {
            marker.lock().unwrap().push("audio");
        }
        let _ = self.cancellation.send(true);
        self.playback_queue.clear();
        if let Some(stream) = self.capture_stream.take() {
            stream.stop_and_join().await;
        }
        if let Some(stream) = self.playback_stream.take() {
            stream.stop_and_join().await;
        }
        if let Some(task) = self.capture_task.take() {
            let _ = task.await;
        }
        if let Some(task) = self.mixer_task.take() {
            let _ = task.await;
        }
    }

    #[cfg(test)]
    pub(crate) fn without_devices(shutdown_marker: Option<Arc<Mutex<Vec<&'static str>>>>) -> Self {
        let (cancellation, _) = watch::channel(false);
        Self {
            cancellation,
            capture_stream: None,
            playback_stream: None,
            capture_task: None,
            mixer_task: None,
            mixer_commands: tokio_mpsc::unbounded_channel().0,
            playback_queue: Arc::new(PlaybackQueue::new(PLAYBACK_QUEUE_CAPACITY)),
            _source: NativeAudioSource::new(
                AudioSourceOptions::default(),
                SAMPLE_RATE,
                CHANNELS,
                0,
            ),
            stopped: false,
            shutdown_marker,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        enqueue_input_samples, enqueue_track_samples, mix_latest_frames, next_playback_sample,
        PlaybackQueue, TrackSlot,
    };
    use std::sync::{Arc, Mutex};
    use tokio::sync::mpsc as tokio_mpsc;

    #[test]
    fn input_handoff_emits_exactly_480_sample_frames() {
        let (sender, mut receiver) = tokio_mpsc::channel(4);
        let mut pending = [0; super::AUDIO_FRAME_SAMPLES];
        let mut pending_len = 0;
        let samples: Vec<i16> = (0..960).map(|sample| sample as i16).collect();
        enqueue_input_samples(
            &samples,
            1,
            &mut pending,
            &mut pending_len,
            &sender,
            |sample| sample,
        );

        let first = receiver.try_recv().unwrap();
        let second = receiver.try_recv().unwrap();
        assert_eq!(first.len(), 480);
        assert_eq!(second.len(), 480);
        assert_eq!(first[0], 0);
        assert_eq!(second[0], 480);
        assert_eq!(pending_len, 0);
    }

    #[test]
    fn full_input_queue_drops_without_blocking() {
        let (sender, _receiver) = tokio_mpsc::channel(1);
        let mut pending = [0; super::AUDIO_FRAME_SAMPLES];
        let mut pending_len = 0;
        enqueue_input_samples(
            &[1; super::AUDIO_FRAME_SAMPLES * 2],
            1,
            &mut pending,
            &mut pending_len,
            &sender,
            |sample| sample,
        );
        assert_eq!(pending_len, 0);
    }

    #[test]
    fn playback_handoff_preserves_480_sample_boundaries() {
        let queue = PlaybackQueue::new(4);
        let slot = Arc::new(TrackSlot::new());
        let mut pending = [0; super::AUDIO_FRAME_SAMPLES];
        let mut pending_len = 0;
        enqueue_track_samples(
            &[7; super::AUDIO_FRAME_SAMPLES + 1],
            &mut pending,
            &mut pending_len,
            &slot,
        );
        assert_eq!(pending_len, 1);
        queue.push_latest(mix_latest_frames(&[slot]).unwrap());
        let mut current = [0; super::AUDIO_FRAME_SAMPLES];
        let mut offset = super::AUDIO_FRAME_SAMPLES;
        assert_eq!(next_playback_sample(&queue, &mut current, &mut offset), 7);
    }

    #[test]
    fn stereo_input_is_downmixed_into_480_sample_mono_frames() {
        let (sender, mut receiver) = tokio_mpsc::channel(2);
        let mut pending = [0; super::AUDIO_FRAME_SAMPLES];
        let mut pending_len = 0;
        let mut samples = Vec::with_capacity(super::AUDIO_FRAME_SAMPLES * 2);
        for _ in 0..super::AUDIO_FRAME_SAMPLES {
            samples.extend_from_slice(&[10_000i16, -2_000]);
        }
        enqueue_input_samples(
            &samples,
            2,
            &mut pending,
            &mut pending_len,
            &sender,
            |sample| sample,
        );
        let frame = receiver.try_recv().unwrap();
        assert_eq!(frame.len(), super::AUDIO_FRAME_SAMPLES);
        assert_eq!(frame[0], 4_000);
        assert_eq!(pending_len, 0);
    }

    #[test]
    fn mixer_sums_concurrent_tracks_and_saturates() {
        let first = Arc::new(TrackSlot::new());
        let second = Arc::new(TrackSlot::new());
        first.replace_latest([30_000; super::AUDIO_FRAME_SAMPLES]);
        second.replace_latest([10_000; super::AUDIO_FRAME_SAMPLES]);
        let mixed = mix_latest_frames(&[first.clone(), second.clone()]).unwrap();
        assert_eq!(mixed[0], i16::MAX);
        assert!(mix_latest_frames(&[first, second]).is_none());
    }

    #[test]
    fn playback_overflow_drops_oldest_frames() {
        let queue = PlaybackQueue::new(2);
        queue.push_latest([1; super::AUDIO_FRAME_SAMPLES]);
        queue.push_latest([2; super::AUDIO_FRAME_SAMPLES]);
        queue.push_latest([3; super::AUDIO_FRAME_SAMPLES]);
        assert_eq!(queue.len_nonblocking(), Some(2));
        assert_eq!(queue.pop_newest_nonblocking().unwrap()[0], 3);
        assert_eq!(queue.len_nonblocking(), Some(0));
        assert!(queue.pop_newest_nonblocking().is_none());
    }

    #[test]
    fn ended_track_slots_are_pruned_from_mixer_bookkeeping() {
        let active = Arc::new(TrackSlot::new());
        let ended = Arc::new(TrackSlot::new());
        ended.mark_ended();
        let mut slots = vec![active.clone(), ended];

        super::prune_ended_slots(&mut slots);
        assert_eq!(slots.len(), 1);
        assert!(Arc::ptr_eq(&slots[0], &active));
    }

    #[test]
    fn mixer_subscription_commands_are_lossless_until_mixer_unavailable() {
        let (sender, mut receiver) = tokio_mpsc::unbounded_channel();
        super::enqueue_mixer_command(&sender, 1).unwrap();
        super::enqueue_mixer_command(&sender, 2).unwrap();
        assert_eq!(receiver.try_recv().unwrap(), 1);
        assert_eq!(receiver.try_recv().unwrap(), 2);

        drop(receiver);
        assert!(super::enqueue_mixer_command(&sender, 3).is_err());
    }

    #[tokio::test]
    async fn shutdown_is_idempotent_without_physical_devices() {
        let marker = Arc::new(Mutex::new(Vec::new()));
        let mut session = super::AudioSession::without_devices(Some(marker.clone()));

        session.shutdown().await;
        session.shutdown().await;
        assert!(session.stopped);
        assert_eq!(&*marker.lock().unwrap(), &["audio"]);
    }
}
