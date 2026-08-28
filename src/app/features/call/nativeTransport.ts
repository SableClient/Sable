import {
  connectNativeCall,
  disconnectNativeCall,
  getAudioRoutes,
  getNativeCallState,
  listenNativeCallSnapshot,
  setAudioRoute,
  setNativeCallCameraEnabled,
  setNativeCallEncryptionKey,
  setNativeCallMicrophoneEnabled,
  setNativeCallPiPEnabled,
  setNativeCallScreenShareEnabled,
  switchNativeCallCamera,
  type NativeCallFailureCode,
  type NativeCallRemoteCamera,
  type NativeCallRemoteParticipant,
  type NativeCallSnapshot,
} from '@sableclient/tauri-plugin-livekit-mobile';
import type {
  CallAudioRoute,
  CallConnectionQuality,
  CallEncryptionKey,
  CallParticipant,
  CallTrack,
  CallTransport,
  CallTransportConnectOptions,
  CallTransportState,
} from '@sableclient/matrixrtc';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('nativeTransport');

const logFailure = (what: string, cause: unknown): void => {
  const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  debugLog.error('call', `${what}. ${detail}`);
};

const failureMessages: Record<NativeCallFailureCode, string> = {
  invalid_request: 'Could not start the call.',
  busy: 'Another call is already in progress.',
  permission_denied: 'Microphone or camera access was denied.',
  connect_failed: 'Could not connect to the call.',
  media_failed: 'Your microphone or camera stopped working.',
  disconnected: 'The connection to the call was lost.',
  cancelled: 'The call was cancelled.',
  unavailable: 'Calls are not available on this device.',
  unexpected: 'The call ended unexpectedly.',
};

const failureMessage = (code: NativeCallFailureCode | undefined): string =>
  (code && failureMessages[code]) || 'The call ended unexpectedly.';

const toBase64 = (key: Uint8Array): string => {
  let binary = '';
  key.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const toTrack = (track: NativeCallRemoteCamera): CallTrack => ({
  id: track.sid,
  muted: track.muted,
  subscribed: track.subscribed,
});

const toQuality = (quality: string | undefined): CallConnectionQuality =>
  quality === 'lost' || quality === 'poor' || quality === 'good' || quality === 'excellent'
    ? quality
    : 'unknown';

const toParticipant = (participant: NativeCallRemoteParticipant): CallParticipant => ({
  identity: participant.identity,
  ...(participant.camera ? { camera: toTrack(participant.camera) } : {}),
  ...(participant.screenShare ? { screenShare: toTrack(participant.screenShare) } : {}),
  ...(participant.microphone ? { microphone: toTrack(participant.microphone) } : {}),
  connectionQuality: toQuality(participant.connectionQuality),
});

export type NativeTransportDependencies = {
  connectCall?: typeof connectNativeCall;
  disconnectCall?: typeof disconnectNativeCall;
  setMicrophone?: typeof setNativeCallMicrophoneEnabled;
  setCamera?: typeof setNativeCallCameraEnabled;
  setEncryptionKey?: typeof setNativeCallEncryptionKey;
  listenSnapshot?: typeof listenNativeCallSnapshot;
};

export type NativeCallTransport = CallTransport & {
  /**
   * Resolves once the snapshot subscription is live. The caller awaits it
   * before joining so no state change between join and connect is missed.
   */
  ready: Promise<void>;
};

/**
 * `CallTransport` over the native LiveKit SDK, reached through the
 * `livekit-mobile` plugin. One transport per call: `callId` scopes every
 * command and filters the snapshot stream, which is global to the plugin.
 */
export const createNativeTransport = (
  callId: string,
  dependencies: NativeTransportDependencies = {}
): NativeCallTransport => {
  const connectCall = dependencies.connectCall ?? connectNativeCall;
  const disconnectCall = dependencies.disconnectCall ?? disconnectNativeCall;
  const setMicrophone = dependencies.setMicrophone ?? setNativeCallMicrophoneEnabled;
  const setCamera = dependencies.setCamera ?? setNativeCallCameraEnabled;
  const setKey = dependencies.setEncryptionKey ?? setNativeCallEncryptionKey;
  const listenSnapshot = dependencies.listenSnapshot ?? listenNativeCallSnapshot;

  let state: CallTransportState = {
    connection: 'connecting',
    participants: [],
    microphoneEnabled: false,
    cameraEnabled: false,
    screenShareEnabled: false,
  };
  let connected = false;
  let disposed = false;
  let revision = -1;
  const pendingKeys: CallEncryptionKey[] = [];
  const listeners = new Set<(next: CallTransportState) => void>();

  const publish = (next: CallTransportState): void => {
    state = next;
    listeners.forEach((listener) => {
      try {
        listener(next);
      } catch (cause) {
        // A state observer must not interrupt lifecycle cleanup.
        logFailure('Native call state listener threw', cause);
      }
    });
  };

  const apply = (snapshot: NativeCallSnapshot): void => {
    if (disposed) return;
    if (snapshot.revision < revision) return;
    revision = snapshot.revision;
    if (snapshot.connectionState === 'idle' || snapshot.connectionState === 'failed') {
      // A snapshot with no callId before our connect resolves reports the
      // plugin's own idle state, not the end of this call.
      if (snapshot.callId === null && !connected) return;
      if (snapshot.callId !== null && snapshot.callId !== callId) return;
      if (snapshot.connectionState === 'failed') {
        debugLog.error('call', `Native call failed: ${snapshot.lastError?.code ?? 'unknown'}`);
      }
      publish({
        connection: 'disconnected',
        participants: [],
        microphoneEnabled: false,
        cameraEnabled: false,
        screenShareEnabled: false,
        ...(snapshot.connectionState === 'failed'
          ? { error: failureMessage(snapshot.lastError?.code) }
          : {}),
      });
      return;
    }
    if (snapshot.callId !== callId) return;
    publish({
      connection: snapshot.connectionState,
      participants: (snapshot.remoteParticipants ?? []).map(toParticipant),
      microphoneEnabled: snapshot.microphoneEnabled,
      cameraEnabled: snapshot.cameraEnabled,
      screenShareEnabled: snapshot.screenShareEnabled,
    });
  };

  const unlistenPromise = listenSnapshot(apply);
  // Mark the listen promise as handled immediately; `disconnect` re-attaches.
  unlistenPromise.catch(() => undefined);

  // A suspended webview loses the snapshots emitted while it slept, so the
  // state is stale on resume. Poll instead of trusting the event stream.
  const resync = (): void => {
    if (disposed || document.visibilityState !== 'visible') return;
    void getNativeCallState()
      .then(apply)
      .catch((cause: unknown) => logFailure('Native call state resync failed', cause));
  };
  document.addEventListener('visibilitychange', resync);

  const send = (key: CallEncryptionKey): Promise<void> =>
    setKey({
      callId,
      identity: key.identity,
      keyIndex: key.keyIndex,
      key: toBase64(key.key),
    }).then(
      () => undefined,
      (cause: unknown) => logFailure(`Native call rejected a key for ${key.identity}`, cause)
    );

  const whenConnected = async (
    what: string,
    command: () => Promise<NativeCallSnapshot | void>
  ): Promise<void> => {
    if (!connected || disposed) return;
    await command().then(
      () => undefined,
      (cause: unknown) => logFailure(what, cause)
    );
  };

  const setCameraEnabled = (enabled: boolean): Promise<void> =>
    whenConnected(`Native call camera ${enabled ? 'on' : 'off'} failed`, () =>
      setCamera({ callId, enabled })
    );

  const connect = async (options: CallTransportConnectOptions): Promise<void> => {
    const snapshot = await connectCall({
      callId,
      url: options.url,
      token: options.token,
      microphoneEnabled: options.microphoneEnabled,
      encryptionKeys: options.encryptionKeys.map((key) => ({
        identity: key.identity,
        keyIndex: key.keyIndex,
        key: toBase64(key.key),
      })),
    });
    connected = true;
    // Everything that arrived while the connection was being established is
    // replayed rather than dropped. Re-writing a key ring slot is a no-op.
    await Promise.all(pendingKeys.splice(0).map(send));
    apply(snapshot);
    if (options.cameraEnabled) await setCameraEnabled(true);
  };

  const disconnect = async (): Promise<void> => {
    disposed = true;
    document.removeEventListener('visibilitychange', resync);
    await disconnectCall({ callId }).then(
      () => undefined,
      (cause: unknown) => logFailure('Native call disconnect failed', cause)
    );
    await unlistenPromise.then(
      (unlisten) => unlisten(),
      (cause: unknown) => logFailure('Native call snapshot listener was never attached', cause)
    );
  };

  return {
    ready: unlistenPromise.then(() => undefined),
    connect,
    disconnect,
    setMicrophoneEnabled: (enabled) =>
      whenConnected(`Native call microphone ${enabled ? 'on' : 'off'} failed`, () =>
        setMicrophone({ callId, enabled })
      ),
    setCameraEnabled,
    setEncryptionKey: async (key) => {
      if (disposed) return;
      if (!connected) {
        pendingKeys.push(key);
        return;
      }
      await send(key);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    capabilities: {
      camera: {
        switch: () =>
          whenConnected('Native call camera switch failed', () =>
            switchNativeCallCamera({ callId })
          ),
      },
      audioRoutes: {
        list: async (): Promise<CallAudioRoute[]> => {
          if (!connected || disposed) return [];
          return getAudioRoutes({ callId }).then(
            (result) => result.routes,
            (cause: unknown) => {
              logFailure('Native call audio routes unavailable', cause);
              return [];
            }
          );
        },
        select: (routeId) =>
          whenConnected('Native call audio route select failed', () =>
            setAudioRoute({ callId, routeId })
          ),
      },
      pictureInPicture: {
        setEnabled: (enabled) =>
          whenConnected(`Native call picture in picture ${enabled ? 'on' : 'off'} failed`, () =>
            setNativeCallPiPEnabled({ callId, enabled })
          ),
      },
      screenShare: {
        setEnabled: (enabled) =>
          whenConnected(`Native call screen share ${enabled ? 'on' : 'off'} failed`, () =>
            setNativeCallScreenShareEnabled({ callId, enabled })
          ),
      },
    },
  };
};
