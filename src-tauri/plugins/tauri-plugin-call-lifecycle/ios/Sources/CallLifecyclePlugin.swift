import AVFoundation
import LiveKit
import Tauri

private struct ConnectArgs: Decodable {
  let operationId: String
  let connectionId: String
  let serverUrl: String
  let participantToken: String
  let audio: Bool
  let video: Bool
  let screenShare: Bool
  let channel: Channel
}

private struct DisconnectArgs: Decodable {
  let operationId: String
  let connectionId: String
}

private enum MediaKind: String, Decodable {
  case microphone
  case camera
  case screenShare = "screen_share"

  var failureCode: FailureCode {
    switch self {
    case .microphone: return .audioFailed
    case .camera: return .cameraFailed
    case .screenShare: return .screenShareFailed
    }
  }
}

private struct SetMediaEnabledArgs: Decodable {
  let operationId: String
  let connectionId: String
  let kind: MediaKind
  let enabled: Bool
}

private struct PlatformStartArgs: Decodable {
  let sessionId: String
  let microphone: Bool
  let playback: Bool
  let channel: Channel
}

private struct PlatformStopArgs: Decodable {
  let sessionId: String
}

private struct ConnectResponse: Encodable {
  let operationId: String
  let connectionId: String
}

private enum PlatformStateKind: String, Encodable {
  case idle
  case active
}

private struct PlatformStateResponse: Encodable {
  let sessionId: String?
  let revision: UInt64
  let state: PlatformStateKind
  let microphone: Bool
  let playback: Bool
}

private struct PlatformCapabilitiesResponse: Encodable {
  let microphone: Bool
  let backgroundAudio: Bool
}

private enum EventKind: String, Encodable {
  case reconnecting
  case reconnected
  case disconnected
  case failed
}

private enum FailureCode: String, Encodable {
  case connectFailed = "connect_failed"
  case audioFailed = "audio_failed"
  case cameraFailed = "camera_failed"
  case videoFailed = "video_failed"
  case screenShareFailed = "screen_share_failed"
  case closeFailed = "close_failed"
}

private enum PlatformEventKind: String, Encodable {
  case focus
  case route
  case interruption
  case mediaServicesReset = "media_services_reset"
  case failure
}

private enum PlatformFocus: String, Encodable {
  case active
  case lost
  case regained
}

private enum PlatformInterruption: String, Encodable {
  case began
  case ended
}

private enum PlatformRoute: String, Encodable {
  case speaker
  case receiver
  case bluetooth
  case wired
  case other
  case none
}

private enum PlatformFailureCode: String, Encodable {
  case busy
  case permissionDenied = "permission_denied"
  case audioSessionFailed = "audio_session_failed"
  case stopFailed = "stop_failed"
}

private struct PlatformEvent: Encodable {
  let sessionId: String
  let revision: UInt64
  let event: PlatformEventKind
  let focus: PlatformFocus?
  let route: PlatformRoute?
  let interruption: PlatformInterruption?
  let code: PlatformFailureCode?
}

private struct ControlEvent: Encodable {
  let operationId: String
  let connectionId: String
  let event: EventKind
  let code: FailureCode?
}

private enum SetupFailure {
  case connect
  case audio
  case camera
  case video
  case screenShare

  var code: FailureCode {
    switch self {
    case .connect: return .connectFailed
    case .audio: return .audioFailed
    case .camera: return .cameraFailed
    case .video: return .videoFailed
    case .screenShare: return .screenShareFailed
    }
  }
}

final class CallLifecyclePlugin: Plugin, RoomDelegate {
  private var room: Room?
  private var operationId: String?
  private var connectionId: String?
  private var eventChannel: Channel?
  private var generation: UInt64 = 0
  private var terminalGenerations = Set<UInt64>()
  private var platformSessionId: String?
  private var platformEventChannel: Channel?
  private var platformMicrophone = false
  private var platformPlayback = false
  private var platformRevision: UInt64 = 0
  private var platformObservers: [NSObjectProtocol] = []

  deinit {
    removePlatformObservers()
    if platformSessionId != nil {
      try? AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )
    }
  }

  @objc public func connect(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ConnectArgs.self)
    Task { @MainActor [weak self] in
      await self?.connect(args, invoke: invoke)
    }
  }

  @objc public func disconnect(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(DisconnectArgs.self)
    Task { @MainActor [weak self] in
      await self?.disconnect(args, invoke: invoke)
    }
  }

  @objc public func setMediaEnabled(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetMediaEnabledArgs.self)
    Task { @MainActor [weak self] in
      await self?.setMediaEnabled(args, invoke: invoke)
    }
  }

  @objc public func capabilities(_ invoke: Invoke) throws {
    invoke.resolve(
      PlatformCapabilitiesResponse(
        microphone: true,
        backgroundAudio: true
      )
    )
  }

  @objc public func start(_ invoke: Invoke) throws {
    guard let args = try? invoke.parseArgs(PlatformStartArgs.self) else {
      invoke.reject("Platform audio session start failed.", code: PlatformFailureCode.audioSessionFailed.rawValue)
      return
    }
    Task { @MainActor [weak self] in
      await self?.start(args, invoke: invoke)
    }
  }

  @objc public func stop(_ invoke: Invoke) throws {
    guard let args = try? invoke.parseArgs(PlatformStopArgs.self) else {
      invoke.reject("Platform audio session stop failed.", code: PlatformFailureCode.stopFailed.rawValue)
      return
    }
    Task { @MainActor [weak self] in
      await self?.stop(args, invoke: invoke)
    }
  }

  @objc public func getState(_ invoke: Invoke) throws {
    Task { @MainActor [weak self] in
      self?.resolvePlatformState(invoke)
    }
  }

  @MainActor
  private func connect(_ args: ConnectArgs, invoke: Invoke) async {
    generation &+= 1
    let currentGeneration = generation

    // There is only one native room. Finish an older room before replacing it;
    // its callbacks are ignored by the generation check below.
    if let oldRoom = room {
      room = nil
      operationId = nil
      connectionId = nil
      eventChannel = nil
      await oldRoom.disconnect()
    }

    let newRoom = Room(delegate: self)
    room = newRoom
    operationId = args.operationId
    connectionId = args.connectionId
    eventChannel = args.channel

    if args.audio {
      do {
        try await requestMicrophoneAndConfigureAudio()
      } catch {
        await fail(.audio, room: newRoom, generation: currentGeneration, invoke: invoke)
        return
      }
    }

    if args.video {
      do {
        guard await requestCameraPermission() else { throw SetupError.denied }
      } catch {
        await fail(.camera, room: newRoom, generation: currentGeneration, invoke: invoke)
        return
      }
    }

    do {
      guard isCurrent(newRoom, generation: currentGeneration) else {
        invoke.reject("Native call setup failed.", code: FailureCode.connectFailed.rawValue)
        return
      }
      try await newRoom.connect(url: args.serverUrl, token: args.participantToken)
    } catch {
      await fail(.connect, room: newRoom, generation: currentGeneration, invoke: invoke)
      return
    }

    guard isCurrent(newRoom, generation: currentGeneration) else {
      invoke.reject("Native call setup failed.", code: FailureCode.connectFailed.rawValue)
      return
    }

    if args.audio {
      do {
        try await newRoom.localParticipant.setMicrophone(enabled: true)
      } catch {
        await fail(.audio, room: newRoom, generation: currentGeneration, invoke: invoke)
        return
      }
    }

    if args.video {
      do {
        try await newRoom.localParticipant.setCamera(enabled: true)
      } catch {
        await fail(.video, room: newRoom, generation: currentGeneration, invoke: invoke)
        return
      }
    }

    if args.screenShare {
      do {
        try await newRoom.localParticipant.setScreenShare(enabled: true)
      } catch {
        await fail(.screenShare, room: newRoom, generation: currentGeneration, invoke: invoke)
        return
      }
    }

    guard isCurrent(newRoom, generation: currentGeneration) else {
      invoke.reject("Native call setup failed.", code: FailureCode.connectFailed.rawValue)
      return
    }
    invoke.resolve(ConnectResponse(operationId: args.operationId, connectionId: args.connectionId))
  }

  @MainActor
  private func start(_ args: PlatformStartArgs, invoke: Invoke) async {
    if room != nil {
      rejectPlatformStart(
        sessionId: args.sessionId,
        channel: args.channel,
        code: .busy,
        invoke: invoke
      )
      return
    }

    if platformSessionId == args.sessionId {
      invoke.resolve(platformState())
      return
    }

    if platformSessionId != nil {
      rejectPlatformStart(
        sessionId: args.sessionId,
        channel: args.channel,
        code: .busy,
        invoke: invoke
      )
      return
    }

    do {
      if args.microphone {
        try await requestPlatformMicrophonePermission()
      }
      try configurePlatformAudioSession(microphone: args.microphone, playback: args.playback)
    } catch SetupError.denied {
      rejectPlatformStart(
        sessionId: args.sessionId,
        channel: args.channel,
        code: .permissionDenied,
        invoke: invoke
      )
      return
    } catch {
      try? AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )
      rejectPlatformStart(
        sessionId: args.sessionId,
        channel: args.channel,
        code: .audioSessionFailed,
        invoke: invoke
      )
      return
    }

    platformSessionId = args.sessionId
    platformEventChannel = args.channel
    platformMicrophone = args.microphone
    platformPlayback = args.playback
    platformRevision &+= 1
    installPlatformObservers()
    emitPlatformEvent(.focus, focus: .active)
    invoke.resolve(platformState())
  }

  @MainActor
  private func stop(_ args: PlatformStopArgs, invoke: Invoke) async {
    guard platformSessionId == args.sessionId,
      let activeSessionId = platformSessionId,
      let activeChannel = platformEventChannel
    else {
      // A stale stop is intentionally a no-op. In particular, it cannot
      // deactivate a newer session that reused this plugin instance.
      invoke.resolve(platformState())
      return
    }

    removePlatformObservers()
    platformSessionId = nil
    platformEventChannel = nil
    platformMicrophone = false
    platformPlayback = false
    platformRevision &+= 1

    do {
      try AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )
      invoke.resolve(platformState())
    } catch {
      sendPlatformEvent(
        .failure,
        sessionId: activeSessionId,
        channel: activeChannel,
        revision: platformRevision,
        code: .stopFailed
      )
      invoke.reject("Platform audio session stop failed.", code: PlatformFailureCode.stopFailed.rawValue)
    }
  }

  @MainActor
  private func resolvePlatformState(_ invoke: Invoke) {
    invoke.resolve(platformState())
  }

  @MainActor
  private func disconnect(_ args: DisconnectArgs, invoke: Invoke) async {
    guard let activeRoom = room,
      operationId == args.operationId,
      connectionId == args.connectionId,
      let activeOperationId = operationId,
      let activeChannel = eventChannel
    else {
      invoke.resolve(ConnectResponse(operationId: args.operationId, connectionId: args.connectionId))
      return
    }

    let closingGeneration = generation
    room = nil
    operationId = nil
    connectionId = nil
    eventChannel = nil
    generation &+= 1

    await activeRoom.disconnect()
    sendTerminalEvent(
      .disconnected,
      operationId: activeOperationId,
      connectionId: args.connectionId,
      channel: activeChannel,
      generation: closingGeneration
    )
    invoke.resolve(ConnectResponse(operationId: args.operationId, connectionId: args.connectionId))
  }

  @MainActor
  private func setMediaEnabled(_ args: SetMediaEnabledArgs, invoke: Invoke) async {
    let code = args.kind.failureCode
    guard let activeRoom = room,
      operationId == args.operationId,
      connectionId == args.connectionId
    else {
      invoke.reject("Native call media toggle failed.", code: code.rawValue)
      return
    }

    // ReplayKit broadcast support is not implemented; screen share is
    // explicitly unsupported on iOS.
    guard args.kind != .screenShare else {
      invoke.reject("Screen share is not supported on iOS.", code: code.rawValue)
      return
    }

    do {
      switch args.kind {
      case .microphone:
        if args.enabled {
          try await requestMicrophoneAndConfigureAudio()
        }
        try await activeRoom.localParticipant.setMicrophone(enabled: args.enabled)
      case .camera:
        if args.enabled {
          guard await requestCameraPermission() else { throw SetupError.denied }
        }
        try await activeRoom.localParticipant.setCamera(enabled: args.enabled)
      case .screenShare:
        throw SetupError.denied
      }
    } catch {
      invoke.reject("Native call media toggle failed.", code: code.rawValue)
      return
    }

    invoke.resolve(
      ConnectResponse(operationId: args.operationId, connectionId: args.connectionId))
  }

  @MainActor
  private func fail(
    _ failure: SetupFailure,
    room failedRoom: Room,
    generation failedGeneration: UInt64,
    invoke: Invoke
  ) async {
    guard isCurrent(failedRoom, generation: failedGeneration) else {
      invoke.reject("Native call setup failed.", code: failure.code.rawValue)
      return
    }
    guard let activeOperationId = operationId,
      let activeConnectionId = connectionId,
      let activeEventChannel = eventChannel
    else {
      invoke.reject("Native call setup failed.", code: failure.code.rawValue)
      return
    }

    sendEvent(
      .failed,
      code: failure.code,
      operationId: activeOperationId,
      connectionId: activeConnectionId,
      channel: activeEventChannel
    )
    terminalGenerations.insert(failedGeneration)
    room = nil
    self.operationId = nil
    self.connectionId = nil
    self.eventChannel = nil
    generation &+= 1
    await failedRoom.disconnect()
    invoke.reject("Native call setup failed.", code: failure.code.rawValue)
  }

  @MainActor
  private func requestMicrophoneAndConfigureAudio() async throws {
    let session = AVAudioSession.sharedInstance()
    if session.recordPermission == .undetermined {
      let granted = await withCheckedContinuation { continuation in
        session.requestRecordPermission { granted in
          continuation.resume(returning: granted)
        }
      }
      guard granted else { throw SetupError.denied }
    } else {
      guard session.recordPermission == .granted else { throw SetupError.denied }
    }

    try session.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
    )
    try session.setActive(true)
  }

  @MainActor
  private func requestPlatformMicrophonePermission() async throws {
    let session = AVAudioSession.sharedInstance()
    if session.recordPermission == .undetermined {
      let granted = await withCheckedContinuation { continuation in
        session.requestRecordPermission { granted in
          continuation.resume(returning: granted)
        }
      }
      guard granted else { throw SetupError.denied }
    } else {
      guard session.recordPermission == .granted else { throw SetupError.denied }
    }
  }

  @MainActor
  private func configurePlatformAudioSession(microphone: Bool, playback: Bool) throws {
    let session = AVAudioSession.sharedInstance()
    if microphone {
      // Recording requires playAndRecord, which also covers playback.
      try session.setCategory(
        .playAndRecord,
        mode: .voiceChat,
        options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
      )
    } else if playback {
      try session.setCategory(.playback)
    } else {
      try session.setCategory(.ambient)
    }
    try session.setActive(true)
  }

  @MainActor
  private func installPlatformObservers() {
    let center = NotificationCenter.default
    let session = AVAudioSession.sharedInstance()
    platformObservers = [
      center.addObserver(
        forName: AVAudioSession.interruptionNotification,
        object: session,
        queue: .main
      ) { [weak self] notification in
        Task { @MainActor [weak self] in
          self?.handlePlatformInterruption(notification)
        }
      },
      center.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: session,
        queue: .main
      ) { [weak self] _ in
        Task { @MainActor [weak self] in
          self?.handlePlatformRouteChange()
        }
      },
      center.addObserver(
        forName: AVAudioSession.mediaServicesWereResetNotification,
        object: session,
        queue: .main
      ) { [weak self] _ in
        Task { @MainActor [weak self] in
          await self?.handlePlatformMediaServicesReset()
        }
      },
    ]
  }

  private func removePlatformObservers() {
    let center = NotificationCenter.default
    platformObservers.forEach { center.removeObserver($0) }
    platformObservers.removeAll()
  }

  @MainActor
  private func handlePlatformInterruption(_ notification: Notification) {
    guard platformSessionId != nil else { return }
    let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = value.flatMap(AVAudioSession.InterruptionType.init(rawValue:))
    else { return }

    switch type {
    case .began:
      emitPlatformEvent(.focus, focus: .lost)
      emitPlatformEvent(.interruption, interruption: .began)
    case .ended:
      let optionsValue = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
      if options.contains(.shouldResume) {
        do {
          try AVAudioSession.sharedInstance().setActive(true)
          emitPlatformEvent(.interruption, interruption: .ended)
          emitPlatformEvent(.focus, focus: .regained)
        } catch {
          failPlatformSession(.audioSessionFailed)
        }
      } else {
        // No resume hint: keep the session inactive and report the bounded
        // interruption/focus state so JS decides whether to restart.
        emitPlatformEvent(.interruption, interruption: .ended)
        emitPlatformEvent(.focus, focus: .lost)
      }
    @unknown default:
      break
    }
  }

  @MainActor
  private func handlePlatformRouteChange() {
    guard platformSessionId != nil else { return }
    emitPlatformEvent(.route, route: currentPlatformRoute())
  }

  @MainActor
  private func handlePlatformMediaServicesReset() async {
    guard platformSessionId != nil else { return }
    emitPlatformEvent(.mediaServicesReset)
    do {
      try configurePlatformAudioSession(
        microphone: platformMicrophone,
        playback: platformPlayback
      )
    } catch {
      failPlatformSession(.audioSessionFailed)
    }
  }

  @MainActor
  private func failPlatformSession(_ code: PlatformFailureCode) {
    guard let activeSessionId = platformSessionId,
      let activeChannel = platformEventChannel
    else { return }

    platformRevision &+= 1
    sendPlatformEvent(
      .failure,
      sessionId: activeSessionId,
      channel: activeChannel,
      revision: platformRevision,
      code: code
    )
    removePlatformObservers()
    platformSessionId = nil
    platformEventChannel = nil
    platformMicrophone = false
    platformPlayback = false
    try? AVAudioSession.sharedInstance().setActive(
      false,
      options: .notifyOthersOnDeactivation
    )
  }

  @MainActor
  private func rejectPlatformStart(
    sessionId: String,
    channel: Channel,
    code: PlatformFailureCode,
    invoke: Invoke
  ) {
    platformRevision &+= 1
    sendPlatformEvent(
      .failure,
      sessionId: sessionId,
      channel: channel,
      revision: platformRevision,
      code: code
    )
    invoke.reject("Platform audio session start failed.", code: code.rawValue)
  }

  @MainActor
  private func platformState() -> PlatformStateResponse {
    PlatformStateResponse(
      sessionId: platformSessionId,
      revision: platformRevision,
      state: platformSessionId == nil ? .idle : .active,
      microphone: platformSessionId == nil ? false : platformMicrophone,
      playback: platformSessionId == nil ? false : platformPlayback
    )
  }

  @MainActor
  private func emitPlatformEvent(
    _ event: PlatformEventKind,
    focus: PlatformFocus? = nil,
    route: PlatformRoute? = nil,
    interruption: PlatformInterruption? = nil
  ) {
    guard let sessionId = platformSessionId,
      let channel = platformEventChannel
    else { return }
    platformRevision &+= 1
    sendPlatformEvent(
      event,
      sessionId: sessionId,
      channel: channel,
      revision: platformRevision,
      focus: focus,
      route: route,
      interruption: interruption
    )
  }

  private func sendPlatformEvent(
    _ event: PlatformEventKind,
    sessionId: String,
    channel: Channel,
    revision: UInt64,
    focus: PlatformFocus? = nil,
    route: PlatformRoute? = nil,
    interruption: PlatformInterruption? = nil,
    code: PlatformFailureCode? = nil
  ) {
    try? channel.send(
      PlatformEvent(
        sessionId: sessionId,
        revision: revision,
        event: event,
        focus: focus,
        route: route,
        interruption: interruption,
        code: code
      )
    )
  }

  @MainActor
  private func currentPlatformRoute() -> PlatformRoute {
    guard let output = AVAudioSession.sharedInstance().currentRoute.outputs.first else {
      return .none
    }
    switch output.portType {
    case .builtInSpeaker:
      return .speaker
    case .builtInReceiver:
      return .receiver
    case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE:
      return .bluetooth
    case .headphones, .headsetMic, .lineOut:
      return .wired
    default:
      return .other
    }
  }

  @MainActor
  private func requestCameraPermission() async -> Bool {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return true
    case .notDetermined:
      return await withCheckedContinuation { continuation in
        AVCaptureDevice.requestAccess(for: .video) { granted in
          continuation.resume(returning: granted)
        }
      }
    default:
      return false
    }
  }

  @MainActor
  private func isCurrent(_ candidate: Room, generation candidateGeneration: UInt64) -> Bool {
    room === candidate && generation == candidateGeneration
  }

  @MainActor
  private func sendEvent(
    _ event: EventKind,
    code: FailureCode? = nil,
    operationId: String,
    connectionId: String,
    channel: Channel
  ) {
    try? channel.send(
      ControlEvent(
        operationId: operationId,
        connectionId: connectionId,
        event: event,
        code: code
      )
    )
  }

  @MainActor
  private func sendTerminalEvent(
    _ event: EventKind,
    operationId: String,
    connectionId: String,
    channel: Channel,
    generation: UInt64
  ) {
    guard !terminalGenerations.contains(generation) else { return }
    terminalGenerations.insert(generation)
    sendEvent(
      event,
      operationId: operationId,
      connectionId: connectionId,
      channel: channel
    )
  }

  func room(
    _ room: Room,
    didUpdate connectionState: ConnectionState,
    from oldState: ConnectionState
  ) {
    Task { @MainActor [weak self] in
      guard let self,
        self.room === room,
        let operationId = self.operationId,
        let connectionId = self.connectionId,
        let channel = self.eventChannel
      else { return }

      switch (oldState, connectionState) {
      case (_, .reconnecting) where oldState != .reconnecting:
        self.sendEvent(
          .reconnecting,
          operationId: operationId,
          connectionId: connectionId,
          channel: channel
        )
      case (.reconnecting, .connected):
        self.sendEvent(
          .reconnected,
          operationId: operationId,
          connectionId: connectionId,
          channel: channel
        )
      case (_, .disconnected):
        self.sendTerminalEvent(
          .disconnected,
          operationId: operationId,
          connectionId: connectionId,
          channel: channel,
          generation: self.generation
        )
        self.room = nil
        self.operationId = nil
        self.connectionId = nil
        self.eventChannel = nil
      default:
        break
      }
    }
  }
}

private enum SetupError: Error {
  case denied
}

@_cdecl("init_plugin_call_lifecycle")
func initPlugin() -> Plugin {
  return CallLifecyclePlugin()
}
