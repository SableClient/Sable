use std::marker::PhantomData;

use livekit::{Room, RoomEvent, RoomOptions};
use secrecy::ExposeSecret;
use tauri::{async_runtime, AppHandle, Emitter, Runtime};
use tokio::sync::{mpsc, oneshot};

#[cfg(test)]
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use crate::error::{Error, Result};
use crate::models::{
    CallLifecycleError, CallState, ConnectRequest, ConnectionState, DisconnectRequest,
};

pub(crate) const STATE_EVENT: &str = "plugin:call-lifecycle://state";
pub(crate) const ERROR_EVENT: &str = "plugin:call-lifecycle://error";

type RoomEvents = mpsc::UnboundedReceiver<RoomEvent>;

struct ConnectedRoom {
    room: OwnedRoom,
    events: RoomEvents,
}

enum OwnedRoom {
    LiveKit(Room),
    #[cfg(test)]
    Fake(Arc<AtomicUsize>),
}

impl OwnedRoom {
    async fn close(self) -> std::result::Result<(), ()> {
        match self {
            Self::LiveKit(room) => room.close().await.map_err(|_| ()),
            #[cfg(test)]
            Self::Fake(closes) => {
                closes.fetch_add(1, Ordering::SeqCst);
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
        room: Option<ConnectedRoom>,
    },
}

struct PendingConnection {
    connection_id: String,
    task: async_runtime::JoinHandle<()>,
    response: oneshot::Sender<Result<CallState>>,
}

struct ActiveConnection {
    connection_id: String,
    room: OwnedRoom,
    events: RoomEvents,
}

pub struct CallLifecycle<R: Runtime> {
    commands: mpsc::Sender<Command>,
    _runtime: PhantomData<fn() -> R>,
}

impl<R: Runtime> CallLifecycle<R> {
    pub(crate) fn new(app: AppHandle<R>) -> Self {
        let (commands, command_rx) = mpsc::channel(32);
        let (internal_tx, internal_rx) = mpsc::unbounded_channel();
        async_runtime::spawn(run_actor(app, command_rx, internal_tx, internal_rx));
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
    machine: StateMachine,
    pending: Option<PendingConnection>,
    active: Option<ActiveConnection>,
}

async fn run_actor<R: Runtime>(
    app: AppHandle<R>,
    commands: mpsc::Receiver<Command>,
    internal_tx: mpsc::UnboundedSender<InternalMessage>,
    internal_rx: mpsc::UnboundedReceiver<InternalMessage>,
) {
    let mut actor = Actor {
        app,
        commands,
        internal_tx,
        internal_rx,
        machine: StateMachine::default(),
        pending: None,
        active: None,
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
                event = receive_room_event(&mut actor.active) => {
                    match event {
                        Some(event) => actor.handle_room_event(event).await,
                        None => {
                            close_active_connection(actor.active.take()).await;
                            actor.transition(ConnectionState::Idle, None);
                        }
                    }
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

async fn receive_room_event(active: &mut Option<ActiveConnection>) -> Option<RoomEvent> {
    match active.as_mut() {
        Some(active) => active.events.recv().await,
        None => std::future::pending().await,
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
                self.transition(ConnectionState::Connecting, Some(connection_id.clone()));
                let internal_tx = self.internal_tx.clone();
                let task = async_runtime::spawn(async move {
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
                    let _ = internal_tx.send(InternalMessage::ConnectFinished {
                        connection_id,
                        room,
                    });
                });
                self.pending = Some(PendingConnection {
                    connection_id: request.connection_id,
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

                let close_result = active.room.close().await;
                self.transition(ConnectionState::Idle, None);
                if close_result.is_err() {
                    let error = Error::CloseFailed;
                    self.emit_error(&error, Some(active.connection_id));
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
                room,
            } => {
                let Some(pending) = self.pending.take() else {
                    close_connected_room(room).await;
                    return;
                };
                if pending.connection_id != connection_id {
                    close_connected_room(room).await;
                    let _ = pending.task.await;
                    return;
                }
                let _ = pending.task.await;

                let Some(ConnectedRoom { room, events }) = room else {
                    let error = Error::ConnectFailed;
                    self.emit_error(&error, Some(connection_id));
                    self.transition(ConnectionState::Idle, None);
                    let _ = pending.response.send(Err(error));
                    return;
                };

                self.active = Some(ActiveConnection {
                    connection_id: connection_id.clone(),
                    room,
                    events,
                });
                self.transition(ConnectionState::Connected, Some(connection_id));
                let _ = pending.response.send(Ok(self.machine.snapshot()));
            }
        }
    }

    async fn handle_room_event(&mut self, event: RoomEvent) {
        match event {
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
                close_active_connection(self.active.take()).await;
                self.transition(ConnectionState::Idle, None);
            }
            _ => {}
        }
    }

    async fn cleanup(&mut self) {
        if let Some(pending) = self.pending.take() {
            pending.task.abort();
            let _ = pending.task.await;
            let _ = pending.response.send(Err(Error::ActorUnavailable));
        }
        close_queued_rooms(&mut self.internal_rx).await;

        close_active_connection(self.active.take()).await;
    }
}

async fn close_active_connection(active: Option<ActiveConnection>) {
    if let Some(active) = active {
        let _ = active.room.close().await;
    }
}

async fn close_connected_room(room: Option<ConnectedRoom>) {
    if let Some(room) = room {
        let _ = room.room.close().await;
    }
}

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
        Arc,
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
        };
        let debug = format!("{request:?}");
        assert!(!debug.contains("secret-jwt"));
        assert!(debug.contains("REDACTED"));
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
        super::close_active_connection(Some(super::ActiveConnection {
            connection_id: "event-ended".into(),
            room: super::OwnedRoom::Fake(event_receiver_closes.clone()),
            events,
        }))
        .await;

        let disconnected_closes = Arc::new(AtomicUsize::new(0));
        let (_events_sender, events) = tokio::sync::mpsc::unbounded_channel::<livekit::RoomEvent>();
        super::close_active_connection(Some(super::ActiveConnection {
            connection_id: "disconnected".into(),
            room: super::OwnedRoom::Fake(disconnected_closes.clone()),
            events,
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
