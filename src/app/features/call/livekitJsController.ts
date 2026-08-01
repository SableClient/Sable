import { Room as LivekitRoom, type RoomOptions } from 'livekit-client';
import type { AutoDiscoveryInfo } from '../../cs-api';
import type { MatrixClient, MatrixRTCSession, Room as MatrixRoom } from '$types/matrix-sdk';
import { disconnectLivekitThenLeaveMatrixRTC } from './matrixRtcCallLifecycle';
import {
  callEncryptsMedia,
  createCallSessionHandles,
  joinCallSession,
  type CallSessionHandles,
} from './callSession';
import {
  LivekitMatrixKeyProvider,
  type LivekitMatrixKeyProviderState,
  isLivekitE2EESupported,
} from './livekitMatrixKeyProvider';
import { getPreferredLivekitTransport, provisionLivekitToken } from './livekitProvisioning';
import { createCallKeyPipeline, type CallKeyPipeline } from './callKeyPipeline';
import { acquireCallOwner, type CallOwnerLease } from '$state/callOwner';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('livekitJsController');

export type LivekitJsControllerLifecycle =
  | 'idle'
  | 'joining-matrix'
  | 'provisioning'
  | 'connecting-livekit'
  | 'active'
  | 'stopping'
  | 'failed';

export type LivekitJsControllerFailure = 'e2ee-unsupported' | 'e2ee-import-failed' | 'setup-failed';

export type LivekitJsControllerState = {
  lifecycle: LivekitJsControllerLifecycle;
  failure: LivekitJsControllerFailure | null;
  room?: LivekitRoom;
  /**
   * Whether local media may be published. An unencrypted call is ready at once;
   * an encrypted one has to hold until the Matrix key is imported, or the first
   * frames would go out in the clear.
   */
  mediaReady: boolean;
  e2ee: Readonly<LivekitMatrixKeyProviderState>;
};

type LivekitJsControllerStateListener = (state: Readonly<LivekitJsControllerState>) => void;

type LivekitJsConnectOptions = {
  mx: MatrixClient;
  room: MatrixRoom;
  discovery?: Pick<AutoDiscoveryInfo, 'org.matrix.msc4143.rtc_foci'>;
  callIntent?: 'audio' | 'video';
  dm?: boolean;
  ongoing?: boolean;
};

type LivekitRoomLike = Pick<LivekitRoom, 'connect' | 'disconnect' | 'setE2EEEnabled'>;

type LivekitJsControllerBase = {
  connect: (options: LivekitJsConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;
  getState: () => Readonly<LivekitJsControllerState>;
  subscribe: (listener: LivekitJsControllerStateListener) => () => void;
};

export type LivekitJsControllerDependencies = {
  createRoom?: (options: RoomOptions) => LivekitRoomLike;
  createWorker?: () => Worker;
  createKeyProvider?: () => LivekitMatrixKeyProvider;
  isE2EESupported?: () => boolean;
  getPreferredTransport?: typeof getPreferredLivekitTransport;
  provisionToken?: typeof provisionLivekitToken;
};

type ControllerRecord = {
  session: MatrixRTCSession;
  pipeline: CallKeyPipeline;
  // MSC4143: encryption is REQUIRED in encrypted rooms and MUST NOT be used in
  // unencrypted ones. An unencrypted call therefore has no provider, no worker
  // and no `encryption` option on the Room.
  encryptMedia: boolean;
  provider?: LivekitMatrixKeyProvider;
  worker?: Worker;
  room?: LivekitRoomLike;
  handles: CallSessionHandles;
  providerDetached: boolean;
  ownerLease: CallOwnerLease;
  cancelled: boolean;
  e2eeFailure: boolean;
  removeKeyStateListener?: () => void;
  cleanupPromise?: Promise<void>;
  resourcesReady: Promise<void>;
  resolveResources: () => void;
};

const initialE2EEState: LivekitMatrixKeyProviderState = {
  ready: false,
  localOutboundIdentity: null,
  keyIndex: null,
  lastImportFailure: null,
};

const defaultCreateRoom = (options: RoomOptions): LivekitRoomLike => new LivekitRoom(options);

const defaultCreateWorker = (): Worker =>
  new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), {
    type: 'module',
  });

export function createLivekitJsController(dependencies: LivekitJsControllerDependencies = {}) {
  const createRoom = dependencies.createRoom ?? defaultCreateRoom;
  const createWorker = dependencies.createWorker ?? defaultCreateWorker;
  const createKeyProvider =
    dependencies.createKeyProvider ?? (() => new LivekitMatrixKeyProvider());
  const supportsE2EE = dependencies.isE2EESupported ?? isLivekitE2EESupported;
  const getPreferredTransport = dependencies.getPreferredTransport ?? getPreferredLivekitTransport;
  const provisionToken = dependencies.provisionToken ?? provisionLivekitToken;

  let state: LivekitJsControllerState = {
    lifecycle: 'idle',
    failure: null,
    room: undefined,
    mediaReady: false,
    e2ee: initialE2EEState,
  };
  let record: ControllerRecord | undefined;
  let operation: Promise<void> | undefined;
  const listeners = new Set<LivekitJsControllerStateListener>();

  const publish = (changes: Partial<LivekitJsControllerState>): void => {
    state = { ...state, ...changes };
    const snapshot = { ...state, e2ee: { ...state.e2ee } };
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // A state observer must not interrupt lifecycle cleanup.
      }
    });
  };

  const cleanup = async (
    current: ControllerRecord,
    result: 'idle' | 'failed',
    failure: LivekitJsControllerFailure | null
  ): Promise<void> => {
    if (current.cleanupPromise) {
      await current.cleanupPromise;
      return;
    }

    current.cancelled = true;
    current.handles.cancelMembershipWait?.();
    current.handles.cancelMembershipWait = undefined;
    publish({ lifecycle: 'stopping' });
    const detachProvider = (): void => {
      if (current.providerDetached) return;
      current.providerDetached = true;
      current.pipeline.detach();
      current.provider?.reset();
    };
    current.cleanupPromise = (async () => {
      if (!current.room && !current.worker) await current.resourcesReady;
      const stopRoom = async (): Promise<void> => {
        await current.room?.disconnect();
      };
      if (current.handles.joinStarted) {
        await disconnectLivekitThenLeaveMatrixRTC(async () => {
          try {
            await stopRoom();
          } finally {
            detachProvider();
          }
        }, current.session);
      } else {
        try {
          await stopRoom();
        } catch {
          // Cleanup continues even when a setup room rejects disconnect.
        } finally {
          detachProvider();
        }
      }
      current.worker?.terminate();
      current.handles.removePageHideListener?.();
      current.handles.removePageHideListener = undefined;
      current.handles.unsubscribeCallRoom?.();
      current.handles.unsubscribeCallRoom = undefined;
      current.removeKeyStateListener?.();
      current.removeKeyStateListener = undefined;
      current.ownerLease.release();
      if (record === current) record = undefined;
      publish({
        lifecycle: result,
        failure,
        room: undefined,
        mediaReady: false,
        ...(result === 'idle' ? { e2ee: initialE2EEState } : {}),
      });
    })();
    await current.cleanupPromise;
  };

  const setup = async (
    current: ControllerRecord,
    connectOptions: LivekitJsConnectOptions
  ): Promise<void> => {
    let failure: LivekitJsControllerFailure | null = null;
    const { encryptMedia, provider } = current;
    try {
      publish({ lifecycle: 'joining-matrix', failure: null });
      debugLog.info(
        'call',
        `setup started for ${connectOptions.room.roomId}: encryptMedia=${encryptMedia}`
      );
      if (encryptMedia && !supportsE2EE()) {
        failure = 'e2ee-unsupported';
      } else {
        if (provider) {
          current.pipeline.setOnKey(provider.setKey);
          current.pipeline.attach(current.session, {
            userId: connectOptions.mx.getSafeUserId(),
            deviceId: connectOptions.mx.getDeviceId(),
          });
        }
        if (current.e2eeFailure || provider?.getKeyState().lastImportFailure) {
          failure = 'e2ee-import-failed';
        } else {
          const joined = await joinCallSession(
            {
              mx: connectOptions.mx,
              room: connectOptions.room,
              session: current.session,
              discovery: connectOptions.discovery,
              getPreferredTransport,
              provisionToken,
              callIntent: connectOptions.callIntent ?? 'audio',
              dm: connectOptions.dm ?? false,
              ongoing: connectOptions.ongoing ?? false,
              encryptMedia,
              isCancelled: () => current.cancelled,
              onStage: (stage) => publish({ lifecycle: stage }),
            },
            current.handles
          );

          if (current.e2eeFailure || provider?.getKeyState().lastImportFailure) {
            failure = 'e2ee-import-failed';
          } else if (!current.cancelled) {
            publish({ lifecycle: 'connecting-livekit' });
            if (provider) current.worker = createWorker();
            current.room = createRoom({
              // Defaults to false in livekit-client. Without it a multi-party
              // call receives every published layer at full quality. The native
              // engine enables it too.
              adaptiveStream: true,
              // dynacast pins a Firefox screen share at 10 bps: its single
              // unsimulcasted layer takes the Firefox branch of
              // setPublishingLayersForSender and never recovers.
              dynacast: false,
              ...(provider && current.worker
                ? { encryption: { keyProvider: provider, worker: current.worker } }
                : {}),
            });
            await current.room.connect(joined.provisioned.url, joined.provisioned.jwt);
            debugLog.info('call', `livekit connected for ${connectOptions.room.roomId}`);
            // The Room only wires up the key provider; it publishes in the
            // clear until this flips `LocalParticipant.encryptionType` to GCM,
            // which is also what tells the SFU our tracks are encrypted. It has
            // to happen before any track is published, so before 'active'.
            if (encryptMedia) await current.room.setE2EEEnabled(true);
            if (current.e2eeFailure) failure = 'e2ee-import-failed';
          }
        }
      }
    } catch (error) {
      failure = current.e2eeFailure ? 'e2ee-import-failed' : 'setup-failed';
      debugLog.error('call', `setup failed for ${connectOptions.room.roomId}: ${failure}`, error);
    } finally {
      current.resolveResources();
    }

    if (failure) {
      debugLog.warn('call', `call did not start in ${connectOptions.room.roomId}: ${failure}`);
      await cleanup(current, 'failed', failure);
    } else if (current.cancelled) {
      await cleanup(current, 'idle', null);
    } else {
      publish({
        lifecycle: 'active',
        failure: null,
        room: current.room as LivekitRoom,
      });
    }
  };

  const connect = (connectOptions: LivekitJsConnectOptions): Promise<void> => {
    if (state.lifecycle === 'failed' && !record && !operation) {
      publish({
        lifecycle: 'idle',
        failure: null,
        room: undefined,
        mediaReady: false,
        e2ee: initialE2EEState,
      });
    }
    if (record || operation || state.lifecycle !== 'idle') {
      return Promise.reject(new Error('LiveKit JS call controller is already in use'));
    }

    const ownerLease = acquireCallOwner('livekit-js', connectOptions.room.roomId);
    if (!ownerLease) {
      publish({
        lifecycle: 'failed',
        failure: 'setup-failed',
        room: undefined,
      });
      return Promise.resolve();
    }

    let resolveResources!: () => void;
    const resourcesReady = new Promise<void>((resolve) => {
      resolveResources = resolve;
    });
    const encryptMedia = callEncryptsMedia(connectOptions.room);
    let session: MatrixRTCSession;
    let provider: LivekitMatrixKeyProvider | undefined;
    try {
      session = connectOptions.mx.matrixRTC.getRoomSession(connectOptions.room);
      if (encryptMedia) provider = createKeyProvider();
    } catch {
      ownerLease.release();
      publish({
        lifecycle: 'failed',
        failure: 'setup-failed',
        room: undefined,
      });
      return Promise.resolve();
    }
    const current: ControllerRecord = {
      session,
      pipeline: createCallKeyPipeline(),
      encryptMedia,
      provider,
      handles: createCallSessionHandles(),
      cancelled: false,
      e2eeFailure: false,
      providerDetached: false,
      ownerLease,
      resourcesReady,
      resolveResources,
    };
    record = current;
    // An unencrypted call has no key to wait for, so its media is ready as soon
    // as it starts. Gating it on the Matrix key would hold the controls and the
    // prescreen choice forever, since no key is ever imported.
    publish({ mediaReady: !encryptMedia });
    current.removeKeyStateListener = provider?.subscribe((e2ee) => {
      publish({ e2ee, mediaReady: e2ee.ready });
      debugLog.info(
        'call',
        `matrix key state for ${connectOptions.room.roomId}: ready=${e2ee.ready} index=${e2ee.keyIndex ?? 'none'} failure=${e2ee.lastImportFailure ?? 'none'}`
      );
      if (e2ee.lastImportFailure) {
        current.e2eeFailure = true;
        current.handles.cancelMembershipWait?.();
        if (current.room) void cleanup(current, 'failed', 'e2ee-import-failed');
      }
    });

    operation = setup(current, connectOptions).finally(() => {
      operation = undefined;
    });
    return operation;
  };

  const disconnect = async (): Promise<void> => {
    if (!record) {
      if (state.lifecycle === 'failed') {
        publish({ lifecycle: 'idle', failure: null });
      }
      return;
    }
    await cleanup(record, 'idle', null);
    await operation;
  };

  const controller: LivekitJsControllerBase = {
    connect,
    disconnect,
    getState: (): Readonly<LivekitJsControllerState> => ({
      ...state,
      e2ee: { ...state.e2ee },
    }),
    subscribe: (listener: LivekitJsControllerStateListener): (() => void) => {
      listeners.add(listener);
      listener({ ...state, e2ee: { ...state.e2ee } });
      return () => listeners.delete(listener);
    },
  };

  return controller;
}
