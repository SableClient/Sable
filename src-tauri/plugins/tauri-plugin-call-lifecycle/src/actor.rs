use std::marker::PhantomData;

use tauri::{async_runtime, AppHandle, Runtime};
use tokio::sync::{mpsc, oneshot};

#[cfg(mobile)]
use tauri::Emitter;

#[cfg(mobile)]
use crate::mobile::{
    MobileBackend, NativePlatformCallEvent, NativeStartPlatformCallLifecycleRequest,
    NativeStopPlatformCallLifecycleRequest,
};

use crate::error::{Error, Result};
#[cfg(mobile)]
use crate::models::{NativePlatformStartFields, PlatformCallEvent, PlatformCallEventKind};
use crate::models::{
    PlatformCallCapabilities, PlatformCallState, PlatformCallStateKind,
    StartPlatformCallLifecycleRequest, StopPlatformCallLifecycleRequest,
};

#[cfg(mobile)]
pub(crate) const PLATFORM_CALL_EVENT: &str = "plugin:call-lifecycle://platform-event";

pub(crate) enum Command {
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

#[cfg(mobile)]
enum InternalMessage {
    PlatformCallEvent(NativePlatformCallEvent),
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
    #[cfg(not(mobile))]
    _runtime: PhantomData<fn() -> R>,
    #[cfg(mobile)]
    app: AppHandle<R>,
    commands: mpsc::Receiver<Command>,
    #[cfg(mobile)]
    internal_tx: mpsc::UnboundedSender<InternalMessage>,
    #[cfg(mobile)]
    internal_rx: mpsc::UnboundedReceiver<InternalMessage>,
    #[cfg(mobile)]
    mobile: MobileBackend<R>,
    platform: PlatformStateMachine,
    #[cfg(mobile)]
    platform_events_task: Option<async_runtime::JoinHandle<()>>,
}

pub struct CallLifecycle<R: Runtime> {
    commands: mpsc::Sender<Command>,
    _runtime: PhantomData<fn() -> R>,
}

impl<R: Runtime> CallLifecycle<R> {
    #[cfg(not(mobile))]
    pub(crate) fn new(_app: AppHandle<R>) -> Self {
        let (commands, command_rx) = mpsc::channel(32);
        async_runtime::spawn(run_actor::<R>(command_rx));
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

#[cfg(not(mobile))]
async fn run_actor<R: Runtime>(commands: mpsc::Receiver<Command>) {
    let mut actor: Actor<R> = Actor {
        _runtime: PhantomData,
        commands,
        platform: PlatformStateMachine::default(),
    };
    loop {
        let Some(command) = actor.commands.recv().await else {
            break;
        };
        actor.handle_command(command).await;
    }

    actor.cleanup().await;
}

#[cfg(mobile)]
async fn run_actor<R: Runtime>(
    app: AppHandle<R>,
    commands: mpsc::Receiver<Command>,
    internal_tx: mpsc::UnboundedSender<InternalMessage>,
    internal_rx: mpsc::UnboundedReceiver<InternalMessage>,
    mobile: MobileBackend<R>,
) {
    let mut actor = Actor {
        app,
        commands,
        internal_tx,
        internal_rx,
        mobile,
        platform: PlatformStateMachine::default(),
        platform_events_task: None,
    };
    loop {
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

    actor.cleanup().await;
}

impl<R: Runtime> Actor<R> {
    async fn handle_command(&mut self, command: Command) {
        match command {
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

    #[cfg(mobile)]
    async fn handle_internal(&mut self, message: InternalMessage) {
        match message {
            InternalMessage::PlatformCallEvent(event) => self.handle_platform_call_event(event),
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

    async fn cleanup(&mut self) {
        #[cfg(mobile)]
        if let Some(task) = self.platform_events_task.take() {
            task.abort();
            let _ = task.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{PlatformStartDecision, PlatformStateMachine, PlatformStopDecision};
    use crate::models::{
        PlatformCallCapabilities, PlatformCallStateKind, StartPlatformCallLifecycleRequest,
    };

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

    #[test]
    fn platform_stop_protects_against_replacement_session() {
        let mut machine = PlatformStateMachine::default();
        machine.capabilities = PlatformCallCapabilities {
            supported: true,
            microphone: true,
            playback: true,
        };
        machine.activate(&StartPlatformCallLifecycleRequest {
            session_id: "first".into(),
            microphone: true,
            playback: true,
        });
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
    fn empty_session_ids_are_rejected_before_any_transition() {
        let mut machine = PlatformStateMachine::default();
        machine.capabilities = PlatformCallCapabilities {
            supported: true,
            microphone: true,
            playback: true,
        };
        assert_eq!(
            machine.start_decision(&StartPlatformCallLifecycleRequest {
                session_id: String::new(),
                microphone: true,
                playback: true,
            }),
            PlatformStartDecision::InvalidSession
        );
        assert_eq!(
            machine.stop_decision(""),
            PlatformStopDecision::InvalidSession
        );
        assert_eq!(machine.snapshot().revision, 0);
        assert_eq!(machine.snapshot().state, PlatformCallStateKind::Idle);
    }

    #[test]
    fn media_flags_must_be_supported_by_the_platform() {
        let mut machine = PlatformStateMachine::default();
        machine.capabilities = PlatformCallCapabilities {
            supported: true,
            microphone: true,
            playback: false,
        };
        assert_eq!(
            machine.start_decision(&StartPlatformCallLifecycleRequest {
                session_id: "session".into(),
                microphone: false,
                playback: true,
            }),
            PlatformStartDecision::Unsupported
        );
        assert_eq!(
            machine.start_decision(&StartPlatformCallLifecycleRequest {
                session_id: "session".into(),
                microphone: true,
                playback: false,
            }),
            PlatformStartDecision::Start
        );
    }

    #[test]
    fn desktop_reports_truthful_unsupported_state() {
        assert_eq!(
            PlatformCallCapabilities::current().supported,
            cfg!(any(target_os = "android", target_os = "ios"))
        );
        #[cfg(not(mobile))]
        {
            let machine = PlatformStateMachine::default();
            assert_eq!(
                machine.start_decision(&StartPlatformCallLifecycleRequest {
                    session_id: "session".into(),
                    microphone: true,
                    playback: true,
                }),
                PlatformStartDecision::Unsupported
            );
            assert_eq!(
                machine.stop_decision("session"),
                PlatformStopDecision::Unsupported
            );
        }
    }
}
