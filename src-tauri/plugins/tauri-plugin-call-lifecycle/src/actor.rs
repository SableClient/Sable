use std::marker::PhantomData;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use livekit::{Room, RoomEvent, RoomOptions};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use secrecy::ExposeSecret;
use tauri::{async_runtime, AppHandle, Emitter, Runtime};
use tokio::sync::{mpsc, oneshot};

#[cfg(mobile)]
use crate::mobile::{
    MobileBackend, NativeConnectRequest, NativeControlEvent, NativeControlEventKind,
    NativeStartPlatformCallLifecycleRequest, NativeStopPlatformCallLifecycleRequest,
};

#[cfg(test)]
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};

use crate::error::{Error, Result};
use crate::models::{
    CallLifecycleError, CallState, ConnectRequest, ConnectionState, DisconnectRequest,
    MediaCapabilities, MediaKind, MediaState, PlatformCallCapabilities, PlatformCallState,
    PlatformCallStateKind, SetMediaEnabledRequest, StartPlatformCallLifecycleRequest,
    StopPlatformCallLifecycleRequest,
};
#[cfg(mobile)]
use crate::models::{
    NativePlatformCallEvent, NativePlatformStartFields, PlatformCallEvent, PlatformCallEventKind,
};

#[cfg(target_os = "linux")]
use crate::{
    audio::AudioSession,
    camera::{CameraFailure, CameraSession},
    screen_share::{ScreenShareFailure, ScreenShareSession},
};
#[cfg(target_os = "macos")]
use crate::{
    camera_macos::{CameraFailure, CameraSession},
    screen_share_macos::{ScreenShareFailure, ScreenShareSession},
};
#[cfg(target_os = "windows")]
use crate::{
    camera_windows::{CameraFailure, CameraSession},
    screen_share_windows::{ScreenShareFailure, ScreenShareSession},
};
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
#[derive(Debug, Clone, Copy)]
enum ScreenShareFailure {
    Unsupported,
    Capture,
}
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
#[allow(dead_code)]
#[derive(Debug, Clone, Copy)]
enum CameraFailure {
    Unsupported,
}

#[derive(Debug, Clone, Copy)]
enum CameraFailureEvent {
    Failure(CameraFailure),
    Closed,
}

#[derive(Debug, Clone, Copy)]
enum ScreenShareFailureEvent {
    Failure(ScreenShareFailure),
    Closed,
}

pub(crate) const STATE_EVENT: &str = "plugin:call-lifecycle://state";
pub(crate) const ERROR_EVENT: &str = "plugin:call-lifecycle://error";
#[cfg(mobile)]
pub(crate) const PLATFORM_CALL_EVENT: &str = "plugin:call-lifecycle://platform-event";

#[cfg(not(any(target_os = "android", target_os = "ios")))]
type RoomEvents = mpsc::UnboundedReceiver<RoomEvent>;
#[cfg(mobile)]
type RoomEvents = mpsc::Receiver<NativeControlEvent>;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
struct ConnectedRoom {
    room: OwnedRoom,
    events: RoomEvents,
}

#[cfg(mobile)]
struct ConnectedRoom {
    events: RoomEvents,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
enum OwnedRoom {
    LiveKit(Room),
    #[cfg(test)]
    Fake(Arc<AtomicUsize>),
    #[cfg(test)]
    FakeOrdered(Arc<std::sync::Mutex<Vec<&'static str>>>),
}

#[cfg(mobile)]
type OwnedRoom<R> = MobileBackend<R>;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
impl OwnedRoom {
    async fn close(self) -> std::result::Result<(), ()> {
        match self {
            Self::LiveKit(room) => room.close().await.map_err(|_| ()),
            #[cfg(test)]
            Self::Fake(closes) => {
                closes.fetch_add(1, Ordering::SeqCst);
                Ok(())
            }
            #[cfg(test)]
            Self::FakeOrdered(events) => {
                events.lock().unwrap().push("room");
                Ok(())
            }
        }
    }
}

pub(crate) enum Command {
    Connect(ConnectRequest, oneshot::Sender<Result<CallState>>),
    Disconnect(DisconnectRequest, oneshot::Sender<Result<CallState>>),
    SetMediaEnabled(SetMediaEnabledRequest, oneshot::Sender<Result<CallState>>),
    GetState(oneshot::Sender<CallState>),
    GetPlatformCallCapabilities(oneshot::Sender<Result<PlatformCallCapabilities>>),
    StartPlatformCallLifecycle(
        StartPlatformCallLifecycleRequest,
        oneshot::Sender<Result<PlatformCallState>>,
    ),
    StopPlatformCallLifecycle(
        StopPlatformCallLifecycleRequest,
        oneshot::Sender<Result<PlatformCallState>>,
    ),
    GetPlatformCallState(oneshot::Sender<Result<PlatformCallState>>),
}

enum InternalMessage {
    ConnectFinished {
        connection_id: String,
        operation_id: String,
        room: Option<ConnectedRoom>,
    },
    #[cfg(mobile)]
    PlatformCallEvent(NativePlatformCallEvent),
}

struct PendingConnection {
    connection_id: String,
    operation_id: String,
    audio: bool,
    video: bool,
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    screen_share: bool,
    task: async_runtime::JoinHandle<()>,
    response: oneshot::Sender<Result<CallState>>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
struct ActiveConnection {
    connection_id: String,
    #[cfg_attr(not(mobile), allow(dead_code))]
    operation_id: String,
    room: OwnedRoom,
    events: RoomEvents,
    #[cfg(target_os = "linux")]
    audio: Option<AudioSession>,
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    camera: Option<CameraSession>,
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    screen_share: Option<ScreenShareSession>,
    #[cfg(test)]
    screen_share_shutdown_marker: Option<Arc<Mutex<Vec<&'static str>>>>,
}

#[cfg(mobile)]
struct ActiveConnection<R: Runtime> {
    connection_id: String,
    operation_id: String,
    room: OwnedRoom<R>,
    events: RoomEvents,
}

pub struct CallLifecycle<R: Runtime> {
    commands: mpsc::Sender<Command>,
    _runtime: PhantomData<fn() -> R>,
}

impl<R: Runtime> CallLifecycle<R> {
    #[cfg(not(mobile))]
    pub(crate) fn new(app: AppHandle<R>) -> Self {
        let (commands, command_rx) = mpsc::channel(32);
        let (internal_tx, internal_rx) = mpsc::unbounded_channel();
        async_runtime::spawn(run_actor(app, command_rx, internal_tx, internal_rx));
        Self {
            commands,
            _runtime: PhantomData,
        }
    }

    #[cfg(mobile)]
    pub(crate) fn new(app: AppHandle<R>, mobile: MobileBackend<R>) -> Self {
        let (commands, command_rx) = mpsc::channel(32);
        let (internal_tx, internal_rx) = mpsc::unbounded_channel();
        async_runtime::spawn(run_actor(app, command_rx, internal_tx, internal_rx, mobile));
        Self {
            commands,
            _runtime: PhantomData,
        }
    }

    pub async fn connect(&self, request: ConnectRequest) -> Result<CallState> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::Connect(request, response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)?
    }

    pub async fn disconnect(&self, request: DisconnectRequest) -> Result<CallState> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::Disconnect(request, response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)?
    }

    pub async fn set_media_enabled(&self, request: SetMediaEnabledRequest) -> Result<CallState> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::SetMediaEnabled(request, response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)?
    }

    pub async fn get_state(&self) -> Result<CallState> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::GetState(response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)
    }

    pub async fn get_platform_call_capabilities(&self) -> Result<PlatformCallCapabilities> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::GetPlatformCallCapabilities(response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)?
    }

    pub async fn start_platform_call_lifecycle(
        &self,
        request: StartPlatformCallLifecycleRequest,
    ) -> Result<PlatformCallState> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::StartPlatformCallLifecycle(request, response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)?
    }

    pub async fn stop_platform_call_lifecycle(
        &self,
        request: StopPlatformCallLifecycleRequest,
    ) -> Result<PlatformCallState> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::StopPlatformCallLifecycle(request, response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)?
    }

    pub async fn get_platform_call_state(&self) -> Result<PlatformCallState> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::GetPlatformCallState(response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)?
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConnectDecision {
    Start,
    Same,
    Busy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DisconnectDecision {
    None,
    CancelPending,
    CloseActive,
    Stale,
}

#[allow(dead_code)]
fn event_matches_generation(
    active_operation_id: &str,
    active_connection_id: &str,
    event_operation_id: &str,
    event_connection_id: &str,
) -> bool {
    active_operation_id == event_operation_id && active_connection_id == event_connection_id
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MediaToggleDecision {
    Apply,
    Idempotent,
    Stale,
    Unsupported,
}

#[derive(Debug, Clone)]
struct StateMachine {
    state: ConnectionState,
    revision: u64,
    connection_id: Option<String>,
    media: MediaState,
}

impl Default for StateMachine {
    fn default() -> Self {
        Self {
            state: ConnectionState::Idle,
            revision: 0,
            connection_id: None,
            media: MediaState::default(),
        }
    }
}

impl StateMachine {
    fn snapshot(&self) -> CallState {
        CallState {
            revision: self.revision,
            state: self.state,
            connection_id: self.connection_id.clone(),
            media: self.media,
            capabilities: MediaCapabilities::current(),
        }
    }

    fn connect_decision(&self, connection_id: &str) -> ConnectDecision {
        match self.connection_id.as_deref() {
            None => ConnectDecision::Start,
            Some(current) if current == connection_id => ConnectDecision::Same,
            Some(_) => ConnectDecision::Busy,
        }
    }

    fn disconnect_decision(&self, connection_id: &str) -> DisconnectDecision {
        if self.connection_id.as_deref() != Some(connection_id) {
            return if self.connection_id.is_some() {
                DisconnectDecision::Stale
            } else {
                DisconnectDecision::None
            };
        }
        match self.state {
            ConnectionState::Connecting => DisconnectDecision::CancelPending,
            ConnectionState::Idle | ConnectionState::Disconnecting => DisconnectDecision::None,
            ConnectionState::Connected | ConnectionState::Reconnecting => {
                DisconnectDecision::CloseActive
            }
        }
    }

    fn transition(&mut self, state: ConnectionState, connection_id: Option<String>) {
        self.revision += 1;
        self.state = state;
        self.connection_id = connection_id;
        if !matches!(
            state,
            ConnectionState::Connected | ConnectionState::Reconnecting
        ) {
            self.media = MediaState::default();
        }
    }

    fn confirm_media(&mut self, kind: MediaKind, enabled: bool) {
        self.revision += 1;
        self.media.set(kind, enabled);
    }

    fn media_decision(&self, request: &SetMediaEnabledRequest) -> MediaToggleDecision {
        if self.connection_id.as_deref() != Some(request.connection_id.as_str()) {
            return MediaToggleDecision::Stale;
        }
        if !matches!(
            self.state,
            ConnectionState::Connected | ConnectionState::Reconnecting
        ) {
            return MediaToggleDecision::Stale;
        }
        if !MediaCapabilities::current().supports(request.kind) {
            return MediaToggleDecision::Unsupported;
        }
        if self.media.enabled(request.kind) == request.enabled {
            return MediaToggleDecision::Idempotent;
        }
        MediaToggleDecision::Apply
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlatformStartDecision {
    Start,
    Idempotent,
    Busy,
    Unsupported,
    InvalidSession,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlatformStopDecision {
    Stop,
    Idempotent,
    Stale,
    Unsupported,
    InvalidSession,
}

#[derive(Debug, Clone)]
struct PlatformStateMachine {
    revision: u64,
    state: PlatformCallStateKind,
    session_id: Option<String>,
    microphone: bool,
    playback: bool,
    capabilities: PlatformCallCapabilities,
    last_session_id: Option<String>,
}

impl Default for PlatformStateMachine {
    fn default() -> Self {
        Self {
            revision: 0,
            state: PlatformCallStateKind::Idle,
            session_id: None,
            microphone: false,
            playback: false,
            capabilities: PlatformCallCapabilities::current(),
            last_session_id: None,
        }
    }
}

impl PlatformStateMachine {
    fn snapshot(&self) -> PlatformCallState {
        PlatformCallState {
            revision: self.revision,
            state: self.state,
            session_id: self.session_id.clone(),
            microphone: self.microphone,
            playback: self.playback,
            capabilities: self.capabilities,
        }
    }

    fn start_decision(&self, request: &StartPlatformCallLifecycleRequest) -> PlatformStartDecision {
        if !self.capabilities.supported {
            return PlatformStartDecision::Unsupported;
        }
        if request.session_id.is_empty() {
            return PlatformStartDecision::InvalidSession;
        }
        if (request.microphone && !self.capabilities.microphone)
            || (request.playback && !self.capabilities.playback)
        {
            return PlatformStartDecision::Unsupported;
        }
        match self.session_id.as_deref() {
            None => PlatformStartDecision::Start,
            Some(session_id)
                if session_id == request.session_id
                    && self.microphone == request.microphone
                    && self.playback == request.playback =>
            {
                PlatformStartDecision::Idempotent
            }
            Some(_) => PlatformStartDecision::Busy,
        }
    }

    fn stop_decision(&self, session_id: &str) -> PlatformStopDecision {
        if !self.capabilities.supported {
            return PlatformStopDecision::Unsupported;
        }
        if session_id.is_empty() {
            return PlatformStopDecision::InvalidSession;
        }
        match self.session_id.as_deref() {
            Some(current) if current == session_id => PlatformStopDecision::Stop,
            Some(_) => PlatformStopDecision::Stale,
            None if self.last_session_id.as_deref() == Some(session_id) => {
                PlatformStopDecision::Idempotent
            }
            None => PlatformStopDecision::Stale,
        }
    }

    fn activate(&mut self, request: &StartPlatformCallLifecycleRequest) {
        self.revision += 1;
        self.state = PlatformCallStateKind::Active;
        self.session_id = Some(request.session_id.clone());
        self.last_session_id = Some(request.session_id.clone());
        self.microphone = request.microphone;
        self.playback = request.playback;
    }

    fn stop(&mut self) {
        self.revision += 1;
        self.state = PlatformCallStateKind::Idle;
        self.session_id = None;
        self.microphone = false;
        self.playback = false;
    }

    #[cfg(mobile)]
    fn next_event_revision(&mut self) -> u64 {
        self.revision += 1;
        self.revision
    }

    #[cfg(mobile)]
    fn fail(&mut self) {
        self.state = PlatformCallStateKind::Idle;
        self.session_id = None;
        self.microphone = false;
        self.playback = false;
    }
}

struct Actor<R: Runtime> {
    app: AppHandle<R>,
    commands: mpsc::Receiver<Command>,
    internal_tx: mpsc::UnboundedSender<InternalMessage>,
    internal_rx: mpsc::UnboundedReceiver<InternalMessage>,
    #[cfg(mobile)]
    mobile: MobileBackend<R>,
    machine: StateMachine,
    pending: Option<PendingConnection>,
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    active: Option<ActiveConnection>,
    #[cfg(mobile)]
    active: Option<ActiveConnection<R>>,
    audio_failure: Option<mpsc::UnboundedReceiver<()>>,
    camera_failure: Option<mpsc::UnboundedReceiver<CameraFailure>>,
    screen_share_failure: Option<mpsc::UnboundedReceiver<ScreenShareFailure>>,
    platform: PlatformStateMachine,
    #[cfg(mobile)]
    platform_events_task: Option<async_runtime::JoinHandle<()>>,
}

async fn run_actor<R: Runtime>(
    app: AppHandle<R>,
    commands: mpsc::Receiver<Command>,
    internal_tx: mpsc::UnboundedSender<InternalMessage>,
    internal_rx: mpsc::UnboundedReceiver<InternalMessage>,
    #[cfg(mobile)] mobile: MobileBackend<R>,
) {
    let mut actor = Actor {
        app,
        commands,
        internal_tx,
        internal_rx,
        #[cfg(mobile)]
        mobile,
        machine: StateMachine::default(),
        pending: None,
        active: None,
        audio_failure: None,
        camera_failure: None,
        screen_share_failure: None,
        platform: PlatformStateMachine::default(),
        #[cfg(mobile)]
        platform_events_task: None,
    };
    actor.emit_state();

    loop {
        if actor.active.is_some() {
            tokio::select! {
                command = actor.commands.recv() => {
                    let Some(command) = command else { break };
                    actor.handle_command(command).await;
                }
                internal = actor.internal_rx.recv() => {
                    let Some(internal) = internal else { break };
                    actor.handle_internal(internal).await;
                }
                event = receive_backend_event(&mut actor.active) => {
                    match event {
                        Some(event) => actor.handle_backend_event(event).await,
                        None => {
                            actor.audio_failure.take();
                            actor.camera_failure.take();
                            #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                            actor.screen_share_failure.take();
                            let _ = close_active_connection(actor.active.take()).await;
                            actor.transition(ConnectionState::Idle, None);
                        }
                    }
                }
                audio_failed = receive_audio_failure(&mut actor.audio_failure) => {
                    if audio_failed {
                        actor.handle_audio_failure().await;
                    }
                }
                camera_failed = receive_camera_failure(&mut actor.camera_failure) => {
                    let failure = match camera_failed {
                        CameraFailureEvent::Failure(failure) => failure,
                        CameraFailureEvent::Closed => CameraFailure::Video,
                    };
                    actor.handle_camera_failure(failure).await;
                }
                screen_share_failed = receive_screen_share_failure(&mut actor.screen_share_failure) => {
                    let failure = match screen_share_failed {
                        ScreenShareFailureEvent::Failure(failure) => failure,
                        ScreenShareFailureEvent::Closed => ScreenShareFailure::Capture,
                    };
                    actor.handle_screen_share_failure(failure).await;
                }
            }
        } else {
            tokio::select! {
                command = actor.commands.recv() => {
                    let Some(command) = command else { break };
                    actor.handle_command(command).await;
                }
                internal = actor.internal_rx.recv() => {
                    let Some(internal) = internal else { break };
                    actor.handle_internal(internal).await;
                }
            }
        }
    }

    actor.cleanup().await;
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
type BackendEvent = RoomEvent;
#[cfg(mobile)]
type BackendEvent = NativeControlEvent;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn receive_backend_event(active: &mut Option<ActiveConnection>) -> Option<BackendEvent> {
    match active.as_mut() {
        Some(active) => active.events.recv().await,
        None => std::future::pending().await,
    }
}

#[cfg(mobile)]
async fn receive_backend_event<R: Runtime>(
    active: &mut Option<ActiveConnection<R>>,
) -> Option<BackendEvent> {
    match active.as_mut() {
        Some(active) => active.events.recv().await,
        None => std::future::pending().await,
    }
}

async fn receive_audio_failure(receiver: &mut Option<mpsc::UnboundedReceiver<()>>) -> bool {
    match receiver.as_mut() {
        Some(receiver) => receiver.recv().await.is_some(),
        None => std::future::pending().await,
    }
}

async fn receive_camera_failure(
    receiver: &mut Option<mpsc::UnboundedReceiver<CameraFailure>>,
) -> CameraFailureEvent {
    if receiver.is_none() {
        return std::future::pending().await;
    }
    match receiver.as_mut().unwrap().recv().await {
        Some(failure) => CameraFailureEvent::Failure(failure),
        None => {
            receiver.take();
            CameraFailureEvent::Closed
        }
    }
}

async fn receive_screen_share_failure(
    receiver: &mut Option<mpsc::UnboundedReceiver<ScreenShareFailure>>,
) -> ScreenShareFailureEvent {
    if receiver.is_none() {
        return std::future::pending().await;
    }
    match receiver.as_mut().unwrap().recv().await {
        Some(failure) => ScreenShareFailureEvent::Failure(failure),
        None => {
            receiver.take();
            ScreenShareFailureEvent::Closed
        }
    }
}

impl<R: Runtime> Actor<R> {
    fn emit_state(&self) {
        let _ = self.app.emit(STATE_EVENT, self.machine.snapshot());
    }

    fn emit_error(&self, error: &Error, connection_id: Option<String>) {
        let payload = CallLifecycleError {
            revision: self.machine.revision,
            code: error.code(),
            message: error.message(),
            connection_id,
        };
        let _ = self.app.emit(ERROR_EVENT, payload);
    }

    fn transition(&mut self, state: ConnectionState, connection_id: Option<String>) {
        self.machine.transition(state, connection_id);
        self.emit_state();
    }

    async fn handle_command(&mut self, command: Command) {
        match command {
            Command::Connect(request, response) => self.handle_connect(request, response).await,
            Command::Disconnect(request, response) => {
                self.handle_disconnect(request, response).await
            }
            Command::SetMediaEnabled(request, response) => {
                self.handle_set_media_enabled(request, response).await
            }
            Command::GetState(response) => {
                let _ = response.send(self.machine.snapshot());
            }
            Command::GetPlatformCallCapabilities(response) => {
                self.handle_get_platform_call_capabilities(response).await
            }
            Command::StartPlatformCallLifecycle(request, response) => {
                self.handle_start_platform_call_lifecycle(request, response)
                    .await
            }
            Command::StopPlatformCallLifecycle(request, response) => {
                self.handle_stop_platform_call_lifecycle(request, response)
                    .await
            }
            Command::GetPlatformCallState(response) => {
                let _ = response.send(Ok(self.platform.snapshot()));
            }
        }
    }

    async fn handle_connect(
        &mut self,
        request: ConnectRequest,
        response: oneshot::Sender<Result<CallState>>,
    ) {
        // Mutual exclusion with the platform lifecycle: a native room cannot
        // start while a platform call session owns the audio session.
        if self.platform.session_id.is_some() {
            let error = Error::Busy;
            self.emit_error(&error, Some(request.connection_id));
            let _ = response.send(Err(error));
            return;
        }
        match self.machine.connect_decision(&request.connection_id) {
            ConnectDecision::Same => {
                let _ = response.send(Ok(self.machine.snapshot()));
            }
            ConnectDecision::Busy => {
                let error = Error::Busy;
                self.emit_error(&error, Some(request.connection_id));
                let _ = response.send(Err(error));
            }
            ConnectDecision::Start => {
                let connection_id = request.connection_id.clone();
                let operation_id = format!("{connection_id}:{}", self.machine.revision);
                self.transition(ConnectionState::Connecting, Some(connection_id.clone()));
                let internal_tx = self.internal_tx.clone();
                #[cfg(mobile)]
                let mobile = self.mobile.clone();
                #[cfg(mobile)]
                let (events_sender, events) = mpsc::channel(32);
                let pending_operation_id = operation_id.clone();
                let task = async_runtime::spawn(async move {
                    #[cfg(not(any(target_os = "android", target_os = "ios")))]
                    let room = Room::connect(
                        &request.server_url,
                        request.participant_token.expose_secret(),
                        RoomOptions::default(),
                    )
                    .await
                    .ok()
                    .map(|(room, events)| ConnectedRoom {
                        room: OwnedRoom::LiveKit(room),
                        events,
                    });
                    #[cfg(mobile)]
                    let room = {
                        let native_result = mobile
                            .connect(NativeConnectRequest {
                                operation_id: &operation_id,
                                connection_id: &connection_id,
                                server_url: &request.server_url,
                                participant_token: &request.participant_token,
                                audio: request.audio,
                                video: request.video,
                                screen_share: request.screen_share,
                                channel: MobileBackend::event_channel(events_sender),
                            })
                            .await;
                        match native_result {
                            Ok(result)
                                if result.operation_id == operation_id
                                    && result.connection_id == connection_id =>
                            {
                                Some(ConnectedRoom { events })
                            }
                            _ => {
                                mobile
                                    .disconnect(
                                        DisconnectRequest {
                                            connection_id: connection_id.clone(),
                                        },
                                        &operation_id,
                                    )
                                    .await;
                                None
                            }
                        }
                    };
                    let _ = internal_tx.send(InternalMessage::ConnectFinished {
                        connection_id: connection_id.clone(),
                        operation_id: operation_id.clone(),
                        room,
                    });
                });
                self.pending = Some(PendingConnection {
                    connection_id: request.connection_id,
                    operation_id: pending_operation_id,
                    audio: request.audio,
                    video: request.video,
                    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                    screen_share: request.screen_share,
                    task,
                    response,
                });
            }
        }
    }

    async fn handle_disconnect(
        &mut self,
        request: DisconnectRequest,
        response: oneshot::Sender<Result<CallState>>,
    ) {
        match self.machine.disconnect_decision(&request.connection_id) {
            DisconnectDecision::None => {
                let _ = response.send(Ok(self.machine.snapshot()));
            }
            DisconnectDecision::Stale => {
                let error = Error::StaleConnection;
                self.emit_error(&error, Some(request.connection_id));
                let _ = response.send(Err(error));
            }
            DisconnectDecision::CancelPending => {
                if let Some(pending) = self.pending.take() {
                    #[cfg(mobile)]
                    self.mobile
                        .disconnect(
                            DisconnectRequest {
                                connection_id: pending.connection_id.clone(),
                            },
                            &pending.operation_id,
                        )
                        .await;
                    pending.task.abort();
                    let _ = pending.task.await;
                    close_queued_rooms(&mut self.internal_rx).await;
                }
                self.transition(ConnectionState::Disconnecting, Some(request.connection_id));
                self.transition(ConnectionState::Idle, None);
                let _ = response.send(Ok(self.machine.snapshot()));
            }
            DisconnectDecision::CloseActive => {
                let active = self.active.take();
                self.transition(
                    ConnectionState::Disconnecting,
                    Some(request.connection_id.clone()),
                );
                let Some(active) = active else {
                    self.transition(ConnectionState::Idle, None);
                    let _ = response.send(Ok(self.machine.snapshot()));
                    return;
                };

                let connection_id = active.connection_id.clone();
                self.audio_failure.take();
                self.camera_failure.take();
                let close_result = close_active_connection(Some(active)).await;
                self.transition(ConnectionState::Idle, None);
                if close_result.is_err() {
                    let error = Error::CloseFailed;
                    self.emit_error(&error, Some(connection_id));
                    let _ = response.send(Err(error));
                } else {
                    let _ = response.send(Ok(self.machine.snapshot()));
                }
            }
        }
    }

    async fn handle_set_media_enabled(
        &mut self,
        request: SetMediaEnabledRequest,
        response: oneshot::Sender<Result<CallState>>,
    ) {
        match self.machine.media_decision(&request) {
            MediaToggleDecision::Idempotent => {
                let _ = response.send(Ok(self.machine.snapshot()));
            }
            MediaToggleDecision::Stale => {
                let error = Error::StaleConnection;
                self.emit_error(&error, Some(request.connection_id));
                let _ = response.send(Err(error));
            }
            MediaToggleDecision::Unsupported => {
                let error = Error::MediaUnsupported;
                self.emit_error(&error, Some(request.connection_id));
                let _ = response.send(Err(error));
            }
            MediaToggleDecision::Apply => self.apply_media_toggle(request, response).await,
        }
    }

    async fn apply_media_toggle(
        &mut self,
        request: SetMediaEnabledRequest,
        response: oneshot::Sender<Result<CallState>>,
    ) {
        let connection_id = request.connection_id.clone();
        let Some(active) = self.active.as_mut() else {
            let error = Error::StaleConnection;
            self.emit_error(&error, Some(connection_id));
            let _ = response.send(Err(error));
            return;
        };
        let enabled = request.enabled;
        let outcome = match request.kind {
            MediaKind::Microphone => {
                toggle_microphone(active, &mut self.audio_failure, enabled).await
            }
            MediaKind::Camera => toggle_camera(active, &mut self.camera_failure, enabled).await,
            MediaKind::ScreenShare => {
                toggle_screen_share(active, &mut self.screen_share_failure, enabled, &self.app)
                    .await
            }
        };
        match outcome {
            Ok(()) => {
                self.machine.confirm_media(request.kind, request.enabled);
                self.emit_state();
                let _ = response.send(Ok(self.machine.snapshot()));
            }
            Err(error) => {
                self.emit_error(&error, Some(connection_id));
                let _ = response.send(Err(error));
            }
        }
    }

    async fn handle_get_platform_call_capabilities(
        &mut self,
        response: oneshot::Sender<Result<PlatformCallCapabilities>>,
    ) {
        #[cfg(mobile)]
        let result = self.mobile.get_platform_call_capabilities().await;
        #[cfg(not(mobile))]
        let result = Ok(PlatformCallCapabilities::current());

        match result {
            Ok(capabilities) => {
                self.platform.capabilities = capabilities;
                let _ = response.send(Ok(capabilities));
            }
            Err(error) => {
                let _ = response.send(Err(error));
            }
        }
    }

    async fn handle_start_platform_call_lifecycle(
        &mut self,
        request: StartPlatformCallLifecycleRequest,
        response: oneshot::Sender<Result<PlatformCallState>>,
    ) {
        match self.platform.start_decision(&request) {
            PlatformStartDecision::Idempotent => {
                let _ = response.send(Ok(self.platform.snapshot()));
            }
            PlatformStartDecision::Unsupported => {
                let _ = response.send(Err(Error::PlatformCallUnsupported));
            }
            PlatformStartDecision::Busy => {
                let _ = response.send(Err(Error::PlatformCallBusy));
            }
            PlatformStartDecision::InvalidSession => {
                let _ = response.send(Err(Error::PlatformCallStaleSession));
            }
            PlatformStartDecision::Start => {
                // The native-room mode and the platform lifecycle are mutually
                // exclusive: both platforms own a single audio session.
                if self.pending.is_some() || self.active.is_some() {
                    let error = Error::PlatformCallBusy;
                    self.emit_error(&error, None);
                    let _ = response.send(Err(error));
                    return;
                }

                #[cfg(mobile)]
                let result = {
                    let (events_sender, mut events) = mpsc::channel(32);
                    let channel = MobileBackend::platform_event_channel(events_sender);
                    let internal_tx = self.internal_tx.clone();
                    let forwarder = async_runtime::spawn(async move {
                        while let Some(event) = events.recv().await {
                            let _ = internal_tx.send(InternalMessage::PlatformCallEvent(event));
                        }
                    });
                    let result = self
                        .mobile
                        .start_platform_call_lifecycle(NativeStartPlatformCallLifecycleRequest {
                            fields: NativePlatformStartFields {
                                session_id: &request.session_id,
                                microphone: request.microphone,
                                playback: request.playback,
                            },
                            channel,
                        })
                        .await;
                    if result.is_err() {
                        forwarder.abort();
                        let _ = forwarder.await;
                    } else {
                        if let Some(stale) = self.platform_events_task.take() {
                            stale.abort();
                        }
                        self.platform_events_task = Some(forwarder);
                    }
                    result
                };
                #[cfg(not(mobile))]
                let result: Result<()> = Err(Error::PlatformCallUnsupported);

                match result {
                    Ok(()) => {
                        self.platform.activate(&request);
                        let _ = response.send(Ok(self.platform.snapshot()));
                    }
                    Err(error) => {
                        let _ = response.send(Err(error));
                    }
                }
            }
        }
    }

    async fn handle_stop_platform_call_lifecycle(
        &mut self,
        request: StopPlatformCallLifecycleRequest,
        response: oneshot::Sender<Result<PlatformCallState>>,
    ) {
        match self.platform.stop_decision(&request.session_id) {
            PlatformStopDecision::Idempotent => {
                let _ = response.send(Ok(self.platform.snapshot()));
            }
            PlatformStopDecision::Unsupported => {
                let _ = response.send(Err(Error::PlatformCallUnsupported));
            }
            PlatformStopDecision::Stale | PlatformStopDecision::InvalidSession => {
                let _ = response.send(Err(Error::PlatformCallStaleSession));
            }
            PlatformStopDecision::Stop => {
                #[cfg(mobile)]
                let result = self
                    .mobile
                    .stop_platform_call_lifecycle(NativeStopPlatformCallLifecycleRequest {
                        session_id: &request.session_id,
                    })
                    .await;
                #[cfg(not(mobile))]
                let result: Result<()> = Err(Error::PlatformCallUnsupported);

                match result {
                    Ok(()) => {
                        #[cfg(mobile)]
                        if let Some(task) = self.platform_events_task.take() {
                            task.abort();
                            let _ = task.await;
                        }
                        self.platform.stop();
                        let _ = response.send(Ok(self.platform.snapshot()));
                    }
                    Err(error) => {
                        let _ = response.send(Err(error));
                    }
                }
            }
        }
    }

    async fn handle_internal(&mut self, message: InternalMessage) {
        match message {
            #[cfg(mobile)]
            InternalMessage::PlatformCallEvent(event) => {
                self.handle_platform_call_event(event);
            }
            InternalMessage::ConnectFinished {
                connection_id,
                operation_id,
                room,
            } => {
                let Some(pending) = self.pending.take() else {
                    close_connected_room(room).await;
                    return;
                };
                if pending.connection_id != connection_id || pending.operation_id != operation_id {
                    close_connected_room(room).await;
                    let _ = pending.task.await;
                    return;
                }
                let _ = pending.task.await;

                let Some(ConnectedRoom {
                    #[cfg(not(any(target_os = "android", target_os = "ios")))]
                    room,
                    events,
                }) = room
                else {
                    let error = Error::ConnectFailed;
                    self.emit_error(&error, Some(connection_id));
                    self.transition(ConnectionState::Idle, None);
                    let _ = pending.response.send(Err(error));
                    return;
                };

                #[cfg(target_os = "linux")]
                let (audio, audio_failure) = if pending.audio {
                    let audio_result = match &room {
                        OwnedRoom::LiveKit(room) => AudioSession::start(room).await,
                        #[cfg(test)]
                        OwnedRoom::Fake(_) => Err("audio requires a live room".to_owned()),
                        #[cfg(test)]
                        OwnedRoom::FakeOrdered(_) => Err("audio requires a live room".to_owned()),
                    };
                    match audio_result {
                        Ok((audio, failure_rx)) => (Some(audio), Some(failure_rx)),
                        Err(_) => {
                            let error = Error::AudioFailed;
                            let _ = room.close().await;
                            self.emit_error(&error, Some(connection_id.clone()));
                            self.transition(ConnectionState::Idle, None);
                            let _ = pending.response.send(Err(error));
                            return;
                        }
                    }
                } else {
                    (None, None)
                };

                #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                let (camera, camera_failure) = if pending.video {
                    let camera_result = match &room {
                        OwnedRoom::LiveKit(room) => CameraSession::start(room).await,
                        #[cfg(test)]
                        OwnedRoom::Fake(_) => Err("camera requires a live room".to_owned()),
                        #[cfg(test)]
                        OwnedRoom::FakeOrdered(_) => Err("camera requires a live room".to_owned()),
                    };
                    match camera_result {
                        Ok((camera, failure_rx)) => (Some(camera), Some(failure_rx)),
                        Err(_) => {
                            #[cfg(target_os = "linux")]
                            if let Some(mut audio) = audio {
                                audio.shutdown().await;
                            }
                            let error = Error::CameraFailed;
                            let _ = room.close().await;
                            self.emit_error(&error, Some(connection_id.clone()));
                            self.transition(ConnectionState::Idle, None);
                            let _ = pending.response.send(Err(error));
                            return;
                        }
                    }
                } else {
                    (None, None)
                };

                #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                let (screen_share, screen_share_failure) = if pending.screen_share {
                    let screen_share_result = match &room {
                        OwnedRoom::LiveKit(room) => {
                            #[cfg(target_os = "windows")]
                            {
                                ScreenShareSession::start(&self.app, room).await
                            }
                            #[cfg(not(target_os = "windows"))]
                            {
                                ScreenShareSession::start(room).await
                            }
                        }
                        #[cfg(test)]
                        OwnedRoom::Fake(_) => Err("screen share requires a live room".to_owned()),
                        #[cfg(test)]
                        OwnedRoom::FakeOrdered(_) => {
                            Err("screen share requires a live room".to_owned())
                        }
                    };
                    match screen_share_result {
                        Ok((screen_share, failure_rx)) => (Some(screen_share), Some(failure_rx)),
                        Err(_) => {
                            #[cfg(target_os = "linux")]
                            if let Some(mut audio) = audio {
                                audio.shutdown().await;
                            }
                            if let Some(mut camera) = camera {
                                camera.shutdown().await;
                            }
                            let error = Error::ScreenShareFailed;
                            let _ = room.close().await;
                            self.emit_error(&error, Some(connection_id.clone()));
                            self.transition(ConnectionState::Idle, None);
                            let _ = pending.response.send(Err(error));
                            return;
                        }
                    }
                } else {
                    (None, None)
                };

                #[cfg(target_os = "linux")]
                {
                    self.audio_failure = audio_failure;
                }
                #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                {
                    self.camera_failure = camera_failure;
                }
                #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                {
                    self.screen_share_failure = screen_share_failure;
                }

                #[allow(unused_mut)]
                let mut media = MediaState::default();
                #[cfg(target_os = "linux")]
                {
                    media.microphone = audio.is_some();
                }
                #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                {
                    media.camera = camera.is_some();
                    media.screen_share = screen_share.is_some();
                }

                self.active = Some(ActiveConnection {
                    connection_id: connection_id.clone(),
                    operation_id,
                    #[cfg(not(any(target_os = "android", target_os = "ios")))]
                    room,
                    #[cfg(mobile)]
                    room: self.mobile.clone(),
                    events,
                    #[cfg(target_os = "linux")]
                    audio,
                    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                    camera,
                    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                    screen_share,
                    #[cfg(test)]
                    screen_share_shutdown_marker: None,
                });
                // Media is only confirmed once the sessions above have started.
                self.machine.media = media;
                self.transition(ConnectionState::Connected, Some(connection_id));
                let _ = pending.response.send(Ok(self.machine.snapshot()));
            }
        }
    }

    #[cfg(mobile)]
    fn handle_platform_call_event(&mut self, event: NativePlatformCallEvent) {
        if self.platform.session_id.as_deref() != Some(event.session_id.as_str()) {
            return;
        }
        let Some(kind) = event.to_kind() else {
            return;
        };
        if matches!(kind, PlatformCallEventKind::Failed { .. }) {
            self.platform.fail();
            if let Some(task) = self.platform_events_task.take() {
                task.abort();
            }
        }
        let payload = PlatformCallEvent {
            revision: self.platform.next_event_revision(),
            session_id: event.session_id,
            kind,
        };
        let _ = self.app.emit(PLATFORM_CALL_EVENT, payload);
    }

    async fn handle_audio_failure(&mut self) {
        #[cfg(not(target_os = "linux"))]
        {
            self.audio_failure.take();
            return;
        }

        #[cfg(target_os = "linux")]
        {
            let Some(connection_id) = self.machine.connection_id.clone() else {
                return;
            };
            let active = self.active.take();
            self.audio_failure.take();
            self.camera_failure.take();
            self.screen_share_failure.take();
            self.transition(ConnectionState::Disconnecting, Some(connection_id.clone()));
            let close_result = close_active_connection(active).await;
            let error = Error::AudioFailed;
            self.emit_error(&error, Some(connection_id.clone()));
            if close_result.is_err() {
                let close_error = Error::CloseFailed;
                self.emit_error(&close_error, Some(connection_id));
            }
            self.transition(ConnectionState::Idle, None);
        }
    }

    async fn handle_camera_failure(&mut self, failure: CameraFailure) {
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        {
            let _ = failure;
            self.camera_failure.take();
            return;
        }

        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        {
            let Some(connection_id) = self.machine.connection_id.clone() else {
                return;
            };
            let active = self.active.take();
            self.audio_failure.take();
            self.camera_failure.take();
            self.screen_share_failure.take();
            self.transition(ConnectionState::Disconnecting, Some(connection_id.clone()));
            let close_result = close_active_connection(active).await;
            let error = match failure {
                CameraFailure::Camera => Error::CameraFailed,
                CameraFailure::Video => Error::VideoFailed,
            };
            self.emit_error(&error, Some(connection_id.clone()));
            if close_result.is_err() {
                let close_error = Error::CloseFailed;
                self.emit_error(&close_error, Some(connection_id));
            }
            self.transition(ConnectionState::Idle, None);
        }
    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    async fn handle_screen_share_failure(&mut self, _failure: ScreenShareFailure) {
        let Some(connection_id) = self.machine.connection_id.clone() else {
            return;
        };
        let active = self.active.take();
        self.audio_failure.take();
        self.camera_failure.take();
        self.screen_share_failure.take();
        self.transition(ConnectionState::Disconnecting, Some(connection_id.clone()));
        let close_result = close_active_connection(active).await;
        let error = Error::ScreenShareFailed;
        self.emit_error(&error, Some(connection_id.clone()));
        if close_result.is_err() {
            let close_error = Error::CloseFailed;
            self.emit_error(&close_error, Some(connection_id));
        }
        self.transition(ConnectionState::Idle, None);
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    async fn handle_screen_share_failure(&mut self, _failure: ScreenShareFailure) {
        self.screen_share_failure.take();
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    async fn handle_backend_event(&mut self, event: RoomEvent) {
        match event {
            RoomEvent::TrackSubscribed { track, .. } => {
                #[cfg(target_os = "linux")]
                if let livekit::track::RemoteTrack::Audio(track) = track {
                    let failed = self
                        .active
                        .as_mut()
                        .and_then(|active| active.audio.as_mut())
                        .map(|audio| audio.subscribe_remote_audio(track).is_err())
                        .unwrap_or(false);
                    if failed {
                        self.handle_audio_failure().await;
                    }
                }
                #[cfg(not(target_os = "linux"))]
                let _ = track;
            }
            RoomEvent::Reconnecting => {
                if let Some(connection_id) = self.machine.connection_id.clone() {
                    self.transition(ConnectionState::Reconnecting, Some(connection_id));
                }
            }
            RoomEvent::Reconnected => {
                if let Some(connection_id) = self.machine.connection_id.clone() {
                    self.transition(ConnectionState::Connected, Some(connection_id));
                }
            }
            RoomEvent::Disconnected { .. } => {
                self.audio_failure.take();
                self.camera_failure.take();
                #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
                self.screen_share_failure.take();
                let _ = close_active_connection(self.active.take()).await;
                self.transition(ConnectionState::Idle, None);
            }
            _ => {}
        }
    }

    #[cfg(mobile)]
    async fn handle_backend_event(&mut self, event: NativeControlEvent) {
        let Some(active) = self.active.as_ref() else {
            return;
        };
        if !event_matches_generation(
            &active.operation_id,
            &active.connection_id,
            &event.operation_id,
            &event.connection_id,
        ) {
            return;
        }

        match event.kind {
            NativeControlEventKind::Reconnecting => {
                self.transition(ConnectionState::Reconnecting, Some(event.connection_id));
            }
            NativeControlEventKind::Reconnected => {
                self.transition(ConnectionState::Connected, Some(event.connection_id));
            }
            NativeControlEventKind::Disconnected => {
                self.audio_failure.take();
                self.camera_failure.take();
                let _ = close_active_connection(self.active.take()).await;
                self.transition(ConnectionState::Idle, None);
            }
            NativeControlEventKind::Failed { code } => {
                let active = self.active.take();
                self.audio_failure.take();
                self.camera_failure.take();
                self.transition(
                    ConnectionState::Disconnecting,
                    Some(event.connection_id.clone()),
                );
                let _ = close_active_connection(active).await;
                let error = code.error();
                self.emit_error(&error, Some(event.connection_id));
                self.transition(ConnectionState::Idle, None);
            }
        }
    }

    async fn cleanup(&mut self) {
        #[cfg(mobile)]
        if let Some(task) = self.platform_events_task.take() {
            task.abort();
            let _ = task.await;
        }
        if let Some(pending) = self.pending.take() {
            pending.task.abort();
            let _ = pending.task.await;
            let _ = pending.response.send(Err(Error::ActorUnavailable));
        }
        close_queued_rooms(&mut self.internal_rx).await;

        self.audio_failure.take();
        self.camera_failure.take();
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        self.screen_share_failure.take();
        let _ = close_active_connection(self.active.take()).await;
    }
}

#[cfg(target_os = "linux")]
async fn toggle_microphone(
    active: &mut ActiveConnection,
    audio_failure: &mut Option<mpsc::UnboundedReceiver<()>>,
    enabled: bool,
) -> Result<()> {
    if enabled {
        let result = match &active.room {
            OwnedRoom::LiveKit(room) => AudioSession::start(room).await,
            #[cfg(test)]
            OwnedRoom::Fake(_) => Err("audio requires a live room".to_owned()),
            #[cfg(test)]
            OwnedRoom::FakeOrdered(_) => Err("audio requires a live room".to_owned()),
        };
        match result {
            Ok((audio, failure_rx)) => {
                active.audio = Some(audio);
                *audio_failure = Some(failure_rx);
                Ok(())
            }
            Err(_) => Err(Error::AudioFailed),
        }
    } else {
        audio_failure.take();
        if let Some(mut audio) = active.audio.take() {
            audio.shutdown().await;
        }
        Ok(())
    }
}

#[cfg(all(
    not(target_os = "linux"),
    not(any(target_os = "android", target_os = "ios"))
))]
async fn toggle_microphone(
    active: &mut ActiveConnection,
    _audio_failure: &mut Option<mpsc::UnboundedReceiver<()>>,
    enabled: bool,
) -> Result<()> {
    let _ = (active, enabled);
    Err(Error::MediaUnsupported)
}

#[cfg(mobile)]
async fn toggle_microphone<R: Runtime>(
    active: &mut ActiveConnection<R>,
    _audio_failure: &mut Option<mpsc::UnboundedReceiver<()>>,
    enabled: bool,
) -> Result<()> {
    active
        .room
        .set_media_enabled(
            &active.operation_id,
            &active.connection_id,
            MediaKind::Microphone,
            enabled,
        )
        .await
}

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
async fn toggle_camera(
    active: &mut ActiveConnection,
    camera_failure: &mut Option<mpsc::UnboundedReceiver<CameraFailure>>,
    enabled: bool,
) -> Result<()> {
    if enabled {
        let result = match &active.room {
            OwnedRoom::LiveKit(room) => CameraSession::start(room).await,
            #[cfg(test)]
            OwnedRoom::Fake(_) => Err("camera requires a live room".to_owned()),
            #[cfg(test)]
            OwnedRoom::FakeOrdered(_) => Err("camera requires a live room".to_owned()),
        };
        match result {
            Ok((camera, failure_rx)) => {
                active.camera = Some(camera);
                *camera_failure = Some(failure_rx);
                Ok(())
            }
            Err(_) => Err(Error::CameraFailed),
        }
    } else {
        camera_failure.take();
        if let Some(mut camera) = active.camera.take() {
            camera.shutdown().await;
        }
        Ok(())
    }
}

#[cfg(mobile)]
async fn toggle_camera<R: Runtime>(
    active: &mut ActiveConnection<R>,
    _camera_failure: &mut Option<mpsc::UnboundedReceiver<CameraFailure>>,
    enabled: bool,
) -> Result<()> {
    active
        .room
        .set_media_enabled(
            &active.operation_id,
            &active.connection_id,
            MediaKind::Camera,
            enabled,
        )
        .await
}

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
async fn toggle_screen_share<R: Runtime>(
    active: &mut ActiveConnection,
    screen_share_failure: &mut Option<mpsc::UnboundedReceiver<ScreenShareFailure>>,
    enabled: bool,
    app: &AppHandle<R>,
) -> Result<()> {
    if enabled {
        let result = match &active.room {
            OwnedRoom::LiveKit(room) => {
                #[cfg(target_os = "windows")]
                {
                    ScreenShareSession::start(app, room).await
                }
                #[cfg(not(target_os = "windows"))]
                {
                    let _ = app;
                    ScreenShareSession::start(room).await
                }
            }
            #[cfg(test)]
            OwnedRoom::Fake(_) => Err("screen share requires a live room".to_owned()),
            #[cfg(test)]
            OwnedRoom::FakeOrdered(_) => Err("screen share requires a live room".to_owned()),
        };
        match result {
            Ok((screen_share, failure_rx)) => {
                active.screen_share = Some(screen_share);
                *screen_share_failure = Some(failure_rx);
                Ok(())
            }
            Err(_) => Err(Error::ScreenShareFailed),
        }
    } else {
        let _ = app;
        screen_share_failure.take();
        if let Some(mut screen_share) = active.screen_share.take() {
            screen_share.shutdown().await;
        }
        Ok(())
    }
}

#[cfg(mobile)]
async fn toggle_screen_share<R: Runtime>(
    active: &mut ActiveConnection<R>,
    _screen_share_failure: &mut Option<mpsc::UnboundedReceiver<ScreenShareFailure>>,
    enabled: bool,
    _app: &AppHandle<R>,
) -> Result<()> {
    active
        .room
        .set_media_enabled(
            &active.operation_id,
            &active.connection_id,
            MediaKind::ScreenShare,
            enabled,
        )
        .await
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn close_active_connection(active: Option<ActiveConnection>) -> std::result::Result<(), ()> {
    if let Some(active) = active {
        #[cfg(target_os = "linux")]
        if let Some(mut audio) = active.audio {
            audio.shutdown().await;
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        if let Some(mut camera) = active.camera {
            camera.shutdown().await;
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        if let Some(mut screen_share) = active.screen_share {
            screen_share.shutdown().await;
        }
        #[cfg(test)]
        if let Some(marker) = active.screen_share_shutdown_marker {
            marker.lock().unwrap().push("screen_share");
        }
        active.room.close().await
    } else {
        Ok(())
    }
}

#[cfg(mobile)]
async fn close_active_connection<R: Runtime>(
    active: Option<ActiveConnection<R>>,
) -> std::result::Result<(), ()> {
    if let Some(active) = active {
        let connection_id = active.connection_id;
        let operation_id = active.operation_id;
        return active
            .room
            .disconnect(DisconnectRequest { connection_id }, &operation_id)
            .await
            .map_err(|_| ());
    }
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn close_connected_room(room: Option<ConnectedRoom>) {
    if let Some(room) = room {
        let _ = room.room.close().await;
    }
}

#[cfg(mobile)]
async fn close_connected_room(_room: Option<ConnectedRoom>) {}

async fn close_queued_rooms(internal_rx: &mut mpsc::UnboundedReceiver<InternalMessage>) {
    while let Ok(message) = internal_rx.try_recv() {
        let InternalMessage::ConnectFinished {
            room: Some(room), ..
        } = message
        else {
            continue;
        };
        close_connected_room(Some(room)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ConnectDecision, DisconnectDecision, MediaToggleDecision, PlatformStartDecision,
        PlatformStateMachine, PlatformStopDecision, StateMachine,
    };
    use crate::error::Error;
    use crate::models::{
        CallLifecycleError, ConnectRequest, ConnectionState, MediaCapabilities, MediaKind,
        MediaState, PlatformCallCapabilities, SetMediaEnabledRequest,
        StartPlatformCallLifecycleRequest,
    };
    use secrecy::SecretString;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };
    use tauri::Listener;

    #[test]
    fn same_id_is_idempotent_and_different_id_is_busy() {
        let mut machine = StateMachine::default();
        assert_eq!(machine.connect_decision("one"), ConnectDecision::Start);
        machine.transition(ConnectionState::Connecting, Some("one".into()));
        assert_eq!(machine.connect_decision("one"), ConnectDecision::Same);
        assert_eq!(machine.connect_decision("two"), ConnectDecision::Busy);
        assert_eq!(machine.snapshot().revision, 1);
    }

    #[test]
    fn stale_disconnect_does_not_close_active_connection() {
        let mut machine = StateMachine::default();
        machine.transition(ConnectionState::Connected, Some("one".into()));
        assert_eq!(
            machine.disconnect_decision("two"),
            DisconnectDecision::Stale
        );
        assert_eq!(machine.snapshot().state, ConnectionState::Connected);
        assert_eq!(
            machine.disconnect_decision("one"),
            DisconnectDecision::CloseActive
        );
    }

    #[test]
    fn stale_native_generation_is_ignored_even_when_connection_id_is_reused() {
        assert!(!super::event_matches_generation(
            "connection:2",
            "connection",
            "connection:1",
            "connection",
        ));
        assert!(super::event_matches_generation(
            "connection:2",
            "connection",
            "connection:2",
            "connection",
        ));
    }

    #[test]
    fn mismatched_disconnect_is_typed_stale_error() {
        let mut machine = StateMachine::default();
        machine.transition(ConnectionState::Connected, Some("one".into()));
        assert_eq!(
            machine.disconnect_decision("two"),
            DisconnectDecision::Stale
        );
        assert_eq!(machine.snapshot().state, ConnectionState::Connected);
        assert_eq!(machine.snapshot().connection_id.as_deref(), Some("one"));
    }

    #[test]
    fn participant_token_debug_is_redacted() {
        let request = ConnectRequest {
            connection_id: "connection".into(),
            server_url: "wss://livekit.example".into(),
            participant_token: SecretString::from("secret-jwt"),
            audio: false,
            video: false,
            screen_share: false,
        };
        let debug = format!("{request:?}");
        assert!(!debug.contains("secret-jwt"));
        assert!(debug.contains("REDACTED"));
    }

    #[test]
    fn media_options_default_to_disabled() {
        let request: ConnectRequest = serde_json::from_value(serde_json::json!({
            "connectionId": "connection",
            "serverUrl": "wss://livekit.example",
            "participantToken": "secret-jwt"
        }))
        .unwrap();
        assert!(!request.audio);
        assert!(!request.video);
        assert!(!request.screen_share);
    }

    #[test]
    fn errors_and_states_have_stable_sanitized_shapes() {
        let error = serde_json::to_value(Error::StaleConnection).unwrap();
        assert_eq!(
            error,
            serde_json::json!({
                "code": "stale_connection",
                "message": "connection ID does not match active call"
            })
        );
        assert_eq!(Error::CameraFailed.code(), "camera_failed");
        assert_eq!(Error::VideoFailed.code(), "video_failed");
        assert_eq!(Error::ScreenShareFailed.code(), "screen_share_failed");
        assert_eq!(
            Error::ScreenShareFailed.message(),
            "native screen share failed"
        );

        let state = serde_json::to_value(ConnectionState::Reconnecting).unwrap();
        assert_eq!(state, serde_json::json!("reconnecting"));

        let event = CallLifecycleError {
            revision: 7,
            code: "stale_connection",
            message: "connection ID does not match active call",
            connection_id: Some("old".into()),
        };
        let event = serde_json::to_value(event).unwrap();
        assert_eq!(event["revision"], 7);
    }

    #[tokio::test]
    async fn queued_completed_room_is_closed_once_when_disconnect_wins() {
        let closes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
        let (_events_sender, events) = tokio::sync::mpsc::unbounded_channel();
        sender
            .send(super::InternalMessage::ConnectFinished {
                connection_id: "one".into(),
                operation_id: "one:1".into(),
                room: Some(super::ConnectedRoom {
                    room: super::OwnedRoom::Fake(closes.clone()),
                    events,
                }),
            })
            .unwrap();

        super::close_queued_rooms(&mut receiver).await;
        super::close_queued_rooms(&mut receiver).await;

        assert_eq!(closes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn terminal_active_room_paths_close_owned_rooms_once() {
        let event_receiver_closes = Arc::new(AtomicUsize::new(0));
        let (_events_sender, events) = tokio::sync::mpsc::unbounded_channel::<livekit::RoomEvent>();
        let _ = super::close_active_connection(Some(super::ActiveConnection {
            connection_id: "event-ended".into(),
            operation_id: "event-ended:1".into(),
            room: super::OwnedRoom::Fake(event_receiver_closes.clone()),
            events,
            #[cfg(target_os = "linux")]
            audio: None,
            #[cfg(target_os = "linux")]
            camera: None,
            #[cfg(target_os = "linux")]
            screen_share: None,
            #[cfg(test)]
            screen_share_shutdown_marker: None,
        }))
        .await;

        let disconnected_closes = Arc::new(AtomicUsize::new(0));
        let (_events_sender, events) = tokio::sync::mpsc::unbounded_channel::<livekit::RoomEvent>();
        let _ = super::close_active_connection(Some(super::ActiveConnection {
            connection_id: "disconnected".into(),
            operation_id: "disconnected:1".into(),
            room: super::OwnedRoom::Fake(disconnected_closes.clone()),
            events,
            #[cfg(target_os = "linux")]
            audio: None,
            #[cfg(target_os = "linux")]
            camera: None,
            #[cfg(target_os = "linux")]
            screen_share: None,
            #[cfg(test)]
            screen_share_shutdown_marker: None,
        }))
        .await;

        assert_eq!(event_receiver_closes.load(Ordering::SeqCst), 1);
        assert_eq!(disconnected_closes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn stale_completion_closes_owned_room_once() {
        let closes = Arc::new(AtomicUsize::new(0));
        let (_events_sender, events) = tokio::sync::mpsc::unbounded_channel::<livekit::RoomEvent>();
        super::close_connected_room(Some(super::ConnectedRoom {
            room: super::OwnedRoom::Fake(closes.clone()),
            events,
        }))
        .await;

        assert_eq!(closes.load(Ordering::SeqCst), 1);
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn audio_is_shutdown_before_room_close() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let (_events_sender, room_events) = tokio::sync::mpsc::unbounded_channel();
        let active = super::ActiveConnection {
            connection_id: "ordered".into(),
            operation_id: "ordered:1".into(),
            room: super::OwnedRoom::FakeOrdered(events.clone()),
            events: room_events,
            audio: Some(crate::audio::AudioSession::without_devices(Some(
                events.clone(),
            ))),
            camera: Some(crate::camera::CameraSession::without_devices(Some(
                events.clone(),
            ))),
            screen_share: None,
            screen_share_shutdown_marker: Some(events.clone()),
        };

        let _ = super::close_active_connection(Some(active)).await;
        assert_eq!(
            &*events.lock().unwrap(),
            &["audio", "camera", "screen_share", "room"]
        );
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn closed_camera_failure_receiver_is_consumed_once() {
        let (sender, receiver) = tokio::sync::mpsc::unbounded_channel::<super::CameraFailure>();
        drop(sender);
        let mut receiver = Some(receiver);

        assert!(matches!(
            super::receive_camera_failure(&mut receiver).await,
            super::CameraFailureEvent::Closed
        ));
        assert!(receiver.is_none());
        assert!(tokio::time::timeout(
            std::time::Duration::from_millis(10),
            super::receive_camera_failure(&mut receiver)
        )
        .await
        .is_err());
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn closed_screen_share_failure_receiver_is_consumed_once() {
        let (sender, receiver) =
            tokio::sync::mpsc::unbounded_channel::<super::ScreenShareFailure>();
        drop(sender);
        let mut receiver = Some(receiver);

        assert!(matches!(
            super::receive_screen_share_failure(&mut receiver).await,
            super::ScreenShareFailureEvent::Closed
        ));
        assert!(receiver.is_none());
        assert!(tokio::time::timeout(
            std::time::Duration::from_millis(10),
            super::receive_screen_share_failure(&mut receiver)
        )
        .await
        .is_err());
    }

    #[test]
    fn explicit_disconnect_has_one_close_transition() {
        let mut machine = StateMachine::default();
        machine.transition(ConnectionState::Connected, Some("one".into()));
        assert_eq!(
            machine.disconnect_decision("one"),
            DisconnectDecision::CloseActive
        );
        machine.transition(ConnectionState::Disconnecting, Some("one".into()));
        machine.transition(ConnectionState::Idle, None);
        assert_eq!(machine.disconnect_decision("one"), DisconnectDecision::None);
        assert_eq!(machine.snapshot().revision, 3);
    }

    fn media_request(
        connection_id: &str,
        kind: MediaKind,
        enabled: bool,
    ) -> SetMediaEnabledRequest {
        SetMediaEnabledRequest {
            connection_id: connection_id.into(),
            kind,
            enabled,
        }
    }

    #[cfg(target_os = "linux")]
    fn actor_with_camera<R: tauri::Runtime>(
        app: tauri::AppHandle<R>,
        camera: Option<crate::camera::CameraSession>,
        media: MediaState,
    ) -> super::Actor<R> {
        let (_commands_tx, commands) = tokio::sync::mpsc::channel(1);
        let (internal_tx, internal_rx) = tokio::sync::mpsc::unbounded_channel();
        let (_events_tx, events) = tokio::sync::mpsc::unbounded_channel();

        super::Actor {
            app,
            commands,
            internal_tx,
            internal_rx,
            machine: super::StateMachine {
                state: ConnectionState::Connected,
                revision: 1,
                connection_id: Some("one".into()),
                media,
            },
            pending: None,
            active: Some(super::ActiveConnection {
                connection_id: "one".into(),
                operation_id: "one:1".into(),
                room: super::OwnedRoom::Fake(Arc::new(AtomicUsize::new(0))),
                events,
                audio: None,
                camera,
                screen_share: None,
                screen_share_shutdown_marker: None,
            }),
            audio_failure: None,
            camera_failure: None,
            screen_share_failure: None,
            platform: super::PlatformStateMachine::default(),
            #[cfg(mobile)]
            platform_events_task: None,
        }
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn failed_media_start_preserves_confirmed_state_without_emitting_state() {
        let app = tauri::test::mock_app();
        let state_events = Arc::new(AtomicUsize::new(0));
        let listener_events = state_events.clone();
        let _listener = app.listen(super::STATE_EVENT, move |_| {
            listener_events.fetch_add(1, Ordering::SeqCst);
        });
        let mut actor = actor_with_camera(app.handle().clone(), None, MediaState::default());
        let before = actor.machine.snapshot();
        let (response, result) = tokio::sync::oneshot::channel();

        actor
            .handle_set_media_enabled(media_request("one", MediaKind::Camera, true), response)
            .await;

        assert!(matches!(result.await, Ok(Err(Error::CameraFailed))));
        assert_eq!(actor.machine.snapshot(), before);
        assert_eq!(state_events.load(Ordering::SeqCst), 0);
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn successful_media_stop_emits_confirmed_snapshot_once() {
        let app = tauri::test::mock_app();
        let state_events = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));
        let listener_events = state_events.clone();
        let _listener = app.listen(super::STATE_EVENT, move |event| {
            listener_events
                .lock()
                .unwrap()
                .push(serde_json::from_str(event.payload()).unwrap());
        });
        let mut actor = actor_with_camera(
            app.handle().clone(),
            Some(crate::camera::CameraSession::without_devices(None)),
            MediaState {
                camera: true,
                ..Default::default()
            },
        );
        let (response, result) = tokio::sync::oneshot::channel();

        actor
            .handle_set_media_enabled(media_request("one", MediaKind::Camera, false), response)
            .await;

        let state = result.await.unwrap().unwrap();
        assert_eq!(state.revision, 2);
        assert!(!state.media.camera);
        assert_eq!(actor.machine.snapshot(), state);
        assert_eq!(
            &*state_events.lock().unwrap(),
            &[serde_json::to_value(state).unwrap()]
        );
    }

    #[test]
    fn media_toggle_is_stale_when_idle_in_progress_or_for_another_connection() {
        let mut machine = StateMachine::default();
        assert_eq!(
            machine.media_decision(&media_request("one", MediaKind::Camera, true)),
            MediaToggleDecision::Stale
        );
        machine.transition(ConnectionState::Connecting, Some("one".into()));
        assert_eq!(
            machine.media_decision(&media_request("one", MediaKind::Camera, true)),
            MediaToggleDecision::Stale
        );
        machine.transition(ConnectionState::Connected, Some("one".into()));
        assert_eq!(
            machine.media_decision(&media_request("two", MediaKind::Camera, true)),
            MediaToggleDecision::Stale
        );
        assert!(machine.snapshot().connection_id.is_some());
    }

    #[test]
    fn media_toggle_respects_truthful_capabilities() {
        let mut machine = StateMachine::default();
        machine.transition(ConnectionState::Connected, Some("one".into()));
        let capabilities = MediaCapabilities::current();
        let kinds = [
            (MediaKind::Microphone, capabilities.microphone),
            (MediaKind::Camera, capabilities.camera),
            (MediaKind::ScreenShare, capabilities.screen_share),
        ];
        for (kind, supported) in kinds {
            let expected = if supported {
                MediaToggleDecision::Apply
            } else {
                MediaToggleDecision::Unsupported
            };
            assert_eq!(
                machine.media_decision(&media_request("one", kind, true)),
                expected,
                "unexpected decision for {kind:?}"
            );
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        {
            assert!(capabilities.camera);
            assert!(capabilities.screen_share);
        }
        assert_eq!(capabilities.microphone, cfg!(target_os = "linux"));
    }

    #[test]
    fn media_toggle_is_idempotent_without_a_revision_bump() {
        let mut machine = StateMachine::default();
        machine.transition(ConnectionState::Connected, Some("one".into()));
        machine.confirm_media(MediaKind::Camera, true);
        let revision = machine.snapshot().revision;
        assert_eq!(
            machine.media_decision(&media_request("one", MediaKind::Camera, true)),
            MediaToggleDecision::Idempotent
        );
        assert_eq!(machine.snapshot().revision, revision);
        assert_eq!(
            machine.media_decision(&media_request("one", MediaKind::Camera, false)),
            MediaToggleDecision::Apply
        );
        assert_eq!(machine.snapshot().revision, revision);
    }

    #[test]
    fn confirmed_media_bumps_revision_and_resets_outside_connected_states() {
        let mut machine = StateMachine::default();
        machine.transition(ConnectionState::Connecting, Some("one".into()));
        assert_eq!(machine.snapshot().media, Default::default());

        machine.transition(ConnectionState::Connected, Some("one".into()));
        machine.confirm_media(MediaKind::ScreenShare, true);
        let snapshot = machine.snapshot();
        assert!(snapshot.media.screen_share);
        assert_eq!(snapshot.revision, 3);

        machine.transition(ConnectionState::Reconnecting, Some("one".into()));
        assert!(machine.snapshot().media.screen_share);

        machine.transition(ConnectionState::Disconnecting, Some("one".into()));
        assert_eq!(machine.snapshot().media, Default::default());
        machine.transition(ConnectionState::Idle, None);
        let snapshot = machine.snapshot();
        assert_eq!(snapshot.media, Default::default());
        assert!(snapshot.connection_id.is_none());
    }

    #[test]
    fn media_toggle_reconnecting_keeps_confirmed_state_and_stays_togglable() {
        let mut machine = StateMachine::default();
        machine.transition(ConnectionState::Connected, Some("one".into()));
        machine.confirm_media(MediaKind::Camera, true);
        machine.transition(ConnectionState::Reconnecting, Some("one".into()));
        assert!(machine.snapshot().media.camera);
        if MediaCapabilities::current().camera {
            assert_eq!(
                machine.media_decision(&media_request("one", MediaKind::Camera, false)),
                MediaToggleDecision::Apply
            );
        }
    }

    #[test]
    fn set_media_enabled_request_and_call_state_have_stable_wire_shapes() {
        let request: SetMediaEnabledRequest = serde_json::from_value(serde_json::json!({
            "connectionId": "one",
            "kind": "screen_share",
            "enabled": true
        }))
        .unwrap();
        assert_eq!(request.kind, MediaKind::ScreenShare);
        assert!(request.enabled);

        let state = serde_json::to_value(StateMachine::default().snapshot()).unwrap();
        assert_eq!(
            state["media"],
            serde_json::json!({
                "microphone": false,
                "camera": false,
                "screenShare": false
            })
        );
        assert!(state["capabilities"].is_object());

        let error = serde_json::to_value(Error::MediaUnsupported).unwrap();
        assert_eq!(
            error,
            serde_json::json!({
                "code": "media_unsupported",
                "message": "media kind is not supported on this platform"
            })
        );
    }

    #[test]
    fn platform_lifecycle_has_opaque_session_and_idempotent_stop_semantics() {
        let mut machine = PlatformStateMachine::default();
        assert_eq!(
            machine.start_decision(&StartPlatformCallLifecycleRequest {
                session_id: "session".into(),
                microphone: true,
                playback: true,
            }),
            PlatformStartDecision::Unsupported
        );

        machine.capabilities = PlatformCallCapabilities {
            supported: true,
            microphone: true,
            playback: true,
        };
        let request = StartPlatformCallLifecycleRequest {
            session_id: "opaque-session".into(),
            microphone: true,
            playback: true,
        };
        assert_eq!(
            machine.start_decision(&request),
            PlatformStartDecision::Start
        );
        machine.activate(&request);
        assert_eq!(
            machine.start_decision(&request),
            PlatformStartDecision::Idempotent
        );
        assert_eq!(
            machine.start_decision(&StartPlatformCallLifecycleRequest {
                session_id: "another-session".into(),
                microphone: true,
                playback: true,
            }),
            PlatformStartDecision::Busy
        );
        assert_eq!(
            machine.stop_decision("another-session"),
            PlatformStopDecision::Stale
        );
        assert_eq!(
            machine.stop_decision("opaque-session"),
            PlatformStopDecision::Stop
        );
        machine.stop();
        assert_eq!(
            machine.stop_decision("opaque-session"),
            PlatformStopDecision::Idempotent
        );
        assert_eq!(machine.snapshot().session_id, None);
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn platform_start_is_busy_while_native_room_is_active() {
        let app = tauri::test::mock_app();
        let mut actor = actor_with_camera(app.handle().clone(), None, MediaState::default());
        actor.platform.capabilities = PlatformCallCapabilities {
            supported: true,
            microphone: true,
            playback: true,
        };
        let revision_before = actor.platform.snapshot().revision;
        let (response, result) = tokio::sync::oneshot::channel();

        actor
            .handle_start_platform_call_lifecycle(
                StartPlatformCallLifecycleRequest {
                    session_id: "session".into(),
                    microphone: true,
                    playback: true,
                },
                response,
            )
            .await;

        assert!(matches!(result.await, Ok(Err(Error::PlatformCallBusy))));
        assert_eq!(actor.platform.snapshot().revision, revision_before);
        assert_eq!(
            actor.platform.snapshot().state,
            super::PlatformCallStateKind::Idle
        );
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn connect_is_busy_while_platform_call_session_is_active() {
        let app = tauri::test::mock_app();
        let mut actor = actor_with_camera(app.handle().clone(), None, MediaState::default());
        // No active native room: clear it so only the platform session remains.
        let connection = actor.active.take();
        let _ = super::close_active_connection(connection).await;
        actor.transition(ConnectionState::Idle, None);
        actor.platform.activate(&StartPlatformCallLifecycleRequest {
            session_id: "session".into(),
            microphone: true,
            playback: true,
        });
        let (response, result) = tokio::sync::oneshot::channel();

        actor
            .handle_connect(
                ConnectRequest {
                    connection_id: "one".into(),
                    server_url: "wss://livekit.example".into(),
                    participant_token: SecretString::from("secret-jwt"),
                    audio: false,
                    video: false,
                    screen_share: false,
                },
                response,
            )
            .await;

        assert!(matches!(result.await, Ok(Err(Error::Busy))));
        assert_eq!(actor.machine.snapshot().state, ConnectionState::Idle);
        assert_eq!(
            actor.platform.snapshot().session_id.as_deref(),
            Some("session")
        );
    }

    #[test]
    fn platform_stop_protects_against_replacement_session() {
        let mut machine = PlatformStateMachine::default();
        machine.capabilities = PlatformCallCapabilities {
            supported: true,
            microphone: true,
            playback: true,
        };
        let first = StartPlatformCallLifecycleRequest {
            session_id: "first".into(),
            microphone: true,
            playback: true,
        };
        machine.activate(&first);
        machine.stop();
        machine.activate(&StartPlatformCallLifecycleRequest {
            session_id: "second".into(),
            microphone: true,
            playback: true,
        });

        // A stop targeted at the replaced session must not touch the active one.
        assert_eq!(machine.stop_decision("first"), PlatformStopDecision::Stale);
        assert_eq!(machine.stop_decision("second"), PlatformStopDecision::Stop);
        machine.stop();
        assert_eq!(
            machine.stop_decision("never-seen"),
            PlatformStopDecision::Stale
        );
    }

    #[test]
    fn platform_contract_serializes_only_bounded_wire_values() {
        let event = serde_json::to_value(crate::models::PlatformCallEvent {
            revision: 4,
            session_id: "opaque-session".into(),
            kind: crate::models::PlatformCallEventKind::RouteChanged {
                route: crate::models::PlatformCallRoute::Bluetooth,
            },
        })
        .unwrap();
        assert_eq!(
            event,
            serde_json::json!({
                "revision": 4,
                "sessionId": "opaque-session",
                "type": "route_changed",
                "route": "bluetooth"
            })
        );
        assert!(
            serde_json::from_value::<crate::models::PlatformCallEventKind>(
                serde_json::json!({ "type": "failed", "code": "start_failed" })
            )
            .is_ok()
        );
        assert!(
            serde_json::from_value::<crate::models::PlatformCallEventKind>(
                serde_json::json!({ "type": "failed", "message": "raw native error" })
            )
            .is_err()
        );
    }
}
