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

private struct ConnectResponse: Encodable {
  let operationId: String
  let connectionId: String
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
