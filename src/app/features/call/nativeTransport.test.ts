import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { createNativeTransport } from './nativeTransport';
import type {
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
  switchNativeCallCamera,
  NativeCallSnapshot,
} from '@sableclient/tauri-plugin-livekit-mobile';
import type { CallEncryptionKey, CallTransportState } from '@sableclient/matrixrtc';

const bridge = vi.hoisted(() => ({
  connectNativeCall: vi.fn<typeof connectNativeCall>(),
  disconnectNativeCall: vi.fn<typeof disconnectNativeCall>(),
  setNativeCallMicrophoneEnabled: vi.fn<typeof setNativeCallMicrophoneEnabled>(),
  setNativeCallCameraEnabled: vi.fn<typeof setNativeCallCameraEnabled>(),
  setNativeCallEncryptionKey: vi.fn<typeof setNativeCallEncryptionKey>(),
  setNativeCallPiPEnabled: vi.fn<typeof setNativeCallPiPEnabled>(),
  switchNativeCallCamera: vi.fn<typeof switchNativeCallCamera>(),
  getAudioRoutes: vi.fn<typeof getAudioRoutes>(),
  setAudioRoute: vi.fn<typeof setAudioRoute>(),
  getNativeCallState: vi.fn<typeof getNativeCallState>(),
  listenNativeCallSnapshot: vi.fn<typeof listenNativeCallSnapshot>(),
}));

vi.mock('@sableclient/tauri-plugin-livekit-mobile', () => bridge);

const CALL_ID = 'call-1';

const snapshot = (overrides: Partial<NativeCallSnapshot> = {}): NativeCallSnapshot => ({
  revision: 1,
  callId: CALL_ID,
  connectionState: 'connected',
  microphoneEnabled: true,
  cameraEnabled: false,
  screenShareEnabled: false,
  participantCount: 0,
  ...overrides,
});

const key = (identity: string, keyIndex: number, bytes: number[]): CallEncryptionKey => ({
  identity,
  keyIndex,
  key: new Uint8Array(bytes),
});

let emit!: (next: NativeCallSnapshot) => void;
let unlisten: ReturnType<typeof vi.fn<UnlistenFn>>;

const connectOptions = (overrides: Record<string, unknown> = {}) => ({
  url: 'wss://livekit.example',
  token: 'jwt',
  microphoneEnabled: true,
  cameraEnabled: false,
  screenShareEnabled: false,
  encryptionKeys: [] as CallEncryptionKey[],
  ...overrides,
});

const sentKeys = () => bridge.setNativeCallEncryptionKey.mock.calls.map(([request]) => request);

beforeEach(() => {
  vi.clearAllMocks();
  unlisten = vi.fn<UnlistenFn>();
  bridge.listenNativeCallSnapshot.mockImplementation((handler) => {
    emit = handler;
    return Promise.resolve(unlisten);
  });
  bridge.connectNativeCall.mockResolvedValue(snapshot());
  bridge.disconnectNativeCall.mockResolvedValue(snapshot({ connectionState: 'idle' }));
  bridge.setNativeCallEncryptionKey.mockResolvedValue(snapshot());
  bridge.setNativeCallCameraEnabled.mockResolvedValue(snapshot());
  bridge.getNativeCallState.mockResolvedValue(snapshot());
});

const connectedTransport = async () => {
  const transport = createNativeTransport(CALL_ID);
  await transport.ready;
  await transport.connect(connectOptions());
  return transport;
};

describe('createNativeTransport encryption keys', () => {
  it('forwards every key whatever the index, including a rejoin back to 0 and a decrease', async () => {
    const transport = await connectedTransport();

    await transport.setEncryptionKey(key('@bob:example.org:BOB', 3, [1, 2, 3]));
    await transport.setEncryptionKey(key('@bob:example.org:BOB', 0, [4, 5]));
    await transport.setEncryptionKey(key('@bob:example.org:BOB', 2, [9, 9]));
    await transport.setEncryptionKey(key('@bob:example.org:BOB', 1, [7]));

    expect(sentKeys().map((request) => request.keyIndex)).toEqual([3, 0, 2, 1]);
    expect(sentKeys().map((request) => request.key)).toEqual(['AQID', 'BAU=', 'CQk=', 'Bw==']);
  });

  it('forwards a repeat of an index already used by the same identity', async () => {
    const transport = await connectedTransport();

    await transport.setEncryptionKey(key('@bob:example.org:BOB', 4, [1, 2, 3]));
    await transport.setEncryptionKey(key('@bob:example.org:BOB', 4, [4, 5]));

    expect(sentKeys()).toEqual([
      { callId: CALL_ID, identity: '@bob:example.org:BOB', keyIndex: 4, key: 'AQID' },
      { callId: CALL_ID, identity: '@bob:example.org:BOB', keyIndex: 4, key: 'BAU=' },
    ]);
  });

  it('keeps each identity on its own key ring', async () => {
    const transport = await connectedTransport();

    await transport.setEncryptionKey(key('@bob:example.org:BOB', 5, [1, 2, 3]));
    await transport.setEncryptionKey(key('@carol:example.org:CAROL', 1, [4, 5]));

    expect(sentKeys().map((request) => [request.identity, request.keyIndex])).toEqual([
      ['@bob:example.org:BOB', 5],
      ['@carol:example.org:CAROL', 1],
    ]);
  });

  it('base64-encodes the raw key bytes for the bridge', async () => {
    const transport = await connectedTransport();

    await transport.setEncryptionKey(key('@bob:example.org:BOB', 0, [0, 1, 250, 255]));

    expect(sentKeys()[0]).toEqual({
      callId: CALL_ID,
      identity: '@bob:example.org:BOB',
      keyIndex: 0,
      key: 'AAH6/w==',
    });
  });

  it('base64-encodes the keys handed to connect', async () => {
    const transport = createNativeTransport(CALL_ID);
    await transport.ready;

    await transport.connect(
      connectOptions({ encryptionKeys: [key('@bob:example.org:BOB', 2, [200, 201, 202, 203])] })
    );

    expect(bridge.connectNativeCall).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptionKeys: [{ identity: '@bob:example.org:BOB', keyIndex: 2, key: 'yMnKyw==' }],
      })
    );
  });

  it('replays the keys that arrived while connect was still in flight', async () => {
    let resolveConnect!: (value: NativeCallSnapshot) => void;
    bridge.connectNativeCall.mockReturnValue(
      new Promise<NativeCallSnapshot>((resolve) => {
        resolveConnect = resolve;
      })
    );
    const transport = createNativeTransport(CALL_ID);
    await transport.ready;

    const connecting = transport.connect(connectOptions());
    await transport.setEncryptionKey(key('@bob:example.org:BOB', 1, [1, 2, 3]));
    await transport.setEncryptionKey(key('@carol:example.org:CAROL', 0, [4, 5]));
    expect(bridge.setNativeCallEncryptionKey).not.toHaveBeenCalled();

    resolveConnect(snapshot());
    await connecting;

    expect(sentKeys().map((request) => [request.identity, request.keyIndex])).toEqual([
      ['@bob:example.org:BOB', 1],
      ['@carol:example.org:CAROL', 0],
    ]);
  });

  it('drops keys once the transport is disposed', async () => {
    const transport = await connectedTransport();
    await transport.disconnect();

    await transport.setEncryptionKey(key('@bob:example.org:BOB', 1, [1, 2, 3]));

    expect(bridge.setNativeCallEncryptionKey).not.toHaveBeenCalled();
  });

  it('swallows a bridge rejection so a bad key never breaks the call', async () => {
    const transport = await connectedTransport();
    bridge.setNativeCallEncryptionKey.mockRejectedValue(new Error('key ring full'));

    await expect(
      transport.setEncryptionKey(key('@bob:example.org:BOB', 1, [1, 2, 3]))
    ).resolves.toBeUndefined();
  });
});

describe('createNativeTransport snapshots', () => {
  it('ignores snapshots belonging to another call', async () => {
    const transport = await connectedTransport();

    emit(snapshot({ callId: 'other-call', connectionState: 'reconnecting', participantCount: 4 }));

    expect(transport.getState().connection).toBe('connected');
  });

  it('ignores a snapshot older than the one already applied', async () => {
    const transport = await connectedTransport();

    emit(snapshot({ revision: 3, connectionState: 'reconnecting', microphoneEnabled: false }));
    emit(snapshot({ revision: 2, connectionState: 'connected', microphoneEnabled: true }));

    expect(transport.getState()).toMatchObject({
      connection: 'reconnecting',
      microphoneEnabled: false,
    });
  });

  it('ignores an idle snapshot with no callId before connect resolves', async () => {
    const transport = createNativeTransport(CALL_ID);
    await transport.ready;

    // The plugin reports its own idle state on subscribe; that is not this
    // call ending.
    emit(snapshot({ callId: null, connectionState: 'idle', microphoneEnabled: false }));

    expect(transport.getState().connection).toBe('connecting');
  });

  it('treats an idle snapshot with no callId after connect as this call ending', async () => {
    const transport = await connectedTransport();

    emit(snapshot({ callId: null, connectionState: 'idle', microphoneEnabled: false }));

    expect(transport.getState().connection).toBe('disconnected');
  });

  it('ignores a terminal snapshot naming another call', async () => {
    const transport = await connectedTransport();

    emit(
      snapshot({
        callId: 'other-call',
        connectionState: 'failed',
        lastError: { code: 'busy', message: 'busy' },
      })
    );

    expect(transport.getState().connection).toBe('connected');
  });

  it('surfaces the failure copy for a terminal snapshot naming this call', async () => {
    const transport = await connectedTransport();

    emit(
      snapshot({
        callId: CALL_ID,
        connectionState: 'failed',
        lastError: { code: 'permission_denied', message: 'denied' },
      })
    );

    expect(transport.getState()).toMatchObject({
      connection: 'disconnected',
      error: 'Microphone or camera access was denied.',
      participants: [],
    });
  });

  it('maps remote participants, tracks and connection quality', async () => {
    const transport = await connectedTransport();

    emit(
      snapshot({
        remoteParticipants: [
          {
            identity: '@bob:example.org:BOB',
            camera: { sid: 'cam-1', muted: false, subscribed: true },
            screenShare: { sid: 'screen-1', muted: true, subscribed: false },
            microphone: { sid: 'mic-1', muted: true, subscribed: true },
            connectionQuality: 'poor',
          },
          { identity: '@carol:example.org:CAROL', connectionQuality: 'nonsense' },
        ],
      })
    );

    expect(transport.getState().participants).toEqual([
      {
        identity: '@bob:example.org:BOB',
        camera: { id: 'cam-1', muted: false, subscribed: true },
        screenShare: { id: 'screen-1', muted: true, subscribed: false },
        microphone: { id: 'mic-1', muted: true, subscribed: true },
        connectionQuality: 'poor',
      },
      { identity: '@carol:example.org:CAROL', connectionQuality: 'unknown' },
    ]);
  });

  it('ignores snapshots arriving after disconnect', async () => {
    const transport = await connectedTransport();
    await transport.disconnect();
    const before = transport.getState();

    emit(snapshot({ connectionState: 'reconnecting' }));

    expect(transport.getState()).toBe(before);
  });
});

describe('createNativeTransport lifecycle', () => {
  it('removes the visibilitychange listener and unlistens the snapshot stream on disconnect', async () => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    try {
      const transport = await connectedTransport();
      const [, resync] = added.mock.calls.find(([type]) => type === 'visibilitychange')!;

      await transport.disconnect();

      expect(removed).toHaveBeenCalledWith('visibilitychange', resync);
      expect(bridge.disconnectNativeCall).toHaveBeenCalledWith({ callId: CALL_ID });
      expect(unlisten).toHaveBeenCalledOnce();
    } finally {
      added.mockRestore();
      removed.mockRestore();
    }
  });

  it('still unlistens when the bridge disconnect rejects', async () => {
    const transport = await connectedTransport();
    bridge.disconnectNativeCall.mockRejectedValue(new Error('no such call'));

    await expect(transport.disconnect()).resolves.toBeUndefined();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('does not let a throwing state listener stop the other listeners or the teardown', async () => {
    const transport = await connectedTransport();
    const seen: CallTransportState[] = [];
    transport.subscribe(() => {
      throw new Error('listener blew up');
    });
    transport.subscribe((next) => seen.push(next));

    emit(snapshot({ connectionState: 'reconnecting' }));

    expect(seen.map((state) => state.connection)).toEqual(['reconnecting']);
    await expect(transport.disconnect()).resolves.toBeUndefined();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('stops delivering to an unsubscribed listener', async () => {
    const transport = await connectedTransport();
    const listener = vi.fn<(next: CallTransportState) => void>();
    const unsubscribe = transport.subscribe(listener);

    unsubscribe();
    emit(snapshot({ connectionState: 'reconnecting' }));

    expect(listener).not.toHaveBeenCalled();
  });

  it('scopes commands to the call and refuses them before connect', async () => {
    const transport = createNativeTransport(CALL_ID);
    await transport.ready;

    await transport.setMicrophoneEnabled(true);
    expect(bridge.setNativeCallMicrophoneEnabled).not.toHaveBeenCalled();

    await transport.connect(connectOptions());
    bridge.setNativeCallMicrophoneEnabled.mockResolvedValue(snapshot());
    await transport.setMicrophoneEnabled(false);

    expect(bridge.setNativeCallMicrophoneEnabled).toHaveBeenCalledWith({
      callId: CALL_ID,
      enabled: false,
    });
  });

  it('turns the camera on after connecting when the call started with video', async () => {
    const transport = createNativeTransport(CALL_ID);
    await transport.ready;

    await transport.connect(connectOptions({ cameraEnabled: true }));

    expect(bridge.setNativeCallCameraEnabled).toHaveBeenCalledWith({
      callId: CALL_ID,
      enabled: true,
    });
  });
});
