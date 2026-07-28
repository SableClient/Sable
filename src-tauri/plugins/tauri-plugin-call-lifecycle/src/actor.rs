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
};

#[cfg(test)]
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};

use crate::error::{Error, Result};
use crate::models::{
    CallLifecycleError, CallState, ConnectRequest, ConnectionState, DisconnectRequest,
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
    GetState(oneshot::Sender<CallState>),
}

enum InternalMessage {
    ConnectFinished {
        connection_id: String,
        operation_id: String,
        room: Option<ConnectedRoom>,
    },
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

    pub async fn get_state(&self) -> Result<CallState> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::GetState(response))
            .await
            .map_err(|_| Error::ActorUnavailable)?;
        result.await.map_err(|_| Error::ActorUnavailable)
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

#[derive(Debug, Clone)]
struct StateMachine {
    state: ConnectionState,
    revision: u64,
    connection_id: Option<String>,
}

impl Default for StateMachine {
    fn default() -> Self {
        Self {
            state: ConnectionState::Idle,
            revision: 0,
            connection_id: None,
        }
    }
}

impl StateMachine {
    fn snapshot(&self) -> CallState {
        CallState {
            revision: self.revision,
            state: self.state,
            connection_id: self.connection_id.clone(),
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
            Command::GetState(response) => {
                let _ = response.send(self.machine.snapshot());
            }
        }
    }

    async fn handle_connect(
        &mut self,
        request: ConnectRequest,
        response: oneshot::Sender<Result<CallState>>,
    ) {
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

    async fn handle_internal(&mut self, message: InternalMessage) {
        match message {
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
                self.transition(ConnectionState::Connected, Some(connection_id));
                let _ = pending.response.send(Ok(self.machine.snapshot()));
            }
        }
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
    use super::{ConnectDecision, DisconnectDecision, StateMachine};
    use crate::error::Error;
    use crate::models::{CallLifecycleError, ConnectRequest, ConnectionState};
    use secrecy::SecretString;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };

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
}
