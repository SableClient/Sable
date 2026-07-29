import AVFoundation
import Tauri

private struct PlatformStartArgs: Decodable {
  let sessionId: String
  let microphone: Bool
  let playback: Bool
  let channel: Channel
}

private struct PlatformStopArgs: Decodable {
  let sessionId: String
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

final class CallLifecyclePlugin: Plugin {
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
  private func start(_ args: PlatformStartArgs, invoke: Invoke) async {
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
    guard let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: value)
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
}

private enum SetupError: Error {
  case denied
}

@_cdecl("init_plugin_call_lifecycle")
func initPlugin() -> Plugin {
  return CallLifecyclePlugin()
}
