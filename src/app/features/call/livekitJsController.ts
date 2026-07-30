import { Room as LivekitRoom, type RoomOptions } from 'livekit-client';
import type { AutoDiscoveryInfo } from '../../cs-api';
import type { MatrixClient, MatrixRTCSession, Room as MatrixRoom } from '$types/matrix-sdk';
import {
  disconnectLivekitThenLeaveMatrixRTC,
  joinAndProvisionMatrixRTC,
} from './matrixRtcCallLifecycle';
import {
  LivekitMatrixKeyProvider,
  type LivekitMatrixKeyProviderState,
  isLivekitE2EESupported,
} from './livekitMatrixKeyProvider';
import { getPreferredLivekitTransport, provisionLivekitToken } from './livekitProvisioning';
import { acquireCallOwner, type CallOwnerLease } from '$state/callOwner';

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

type LivekitRoomLike = Pick<LivekitRoom, 'connect' | 'disconnect'>;

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
  provider: LivekitMatrixKeyProvider;
  worker?: Worker;
  room?: LivekitRoomLike;
  matrixJoinStarted: boolean;
  providerDetached: boolean;
  ownerLease: CallOwnerLease;
  cancelled: boolean;
  e2eeFailure: boolean;
  cancelMembershipWait?: () => void;
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
    current.cancelMembershipWait?.();
    current.cancelMembershipWait = undefined;
    publish({ lifecycle: 'stopping' });
    const detachProvider = (): void => {
      if (current.providerDetached) return;
      current.providerDetached = true;
      try {
        current.provider.detach();
      } catch {}
    };
    current.cleanupPromise = (async () => {
      if (!current.room && !current.worker) await current.resourcesReady;
      const stopRoom = async (): Promise<void> => {
        await current.room?.disconnect();
      };
      if (current.matrixJoinStarted) {
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
      current.removeKeyStateListener?.();
      current.removeKeyStateListener = undefined;
      current.ownerLease.release();
      if (record === current) record = undefined;
      publish({
        lifecycle: result,
        failure,
        room: undefined,
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
    try {
      publish({ lifecycle: 'joining-matrix', failure: null });
      if (!supportsE2EE()) {
        failure = 'e2ee-unsupported';
      } else {
        current.provider.attach(current.session);
        if (current.e2eeFailure || current.provider.getKeyState().lastImportFailure) {
          failure = 'e2ee-import-failed';
        } else {
          const joined = await joinAndProvisionMatrixRTC({
            mx: connectOptions.mx,
            room: connectOptions.room,
            session: current.session,
            discovery: connectOptions.discovery,
            getPreferredTransport,
            provisionToken,
            callIntent: connectOptions.callIntent ?? 'audio',
            ...(connectOptions.ongoing
              ? {}
              : {
                  notificationType: connectOptions.dm ? 'ring' : 'notification',
                }),
            manageMediaKeys: true,
            isCancelled: () => current.cancelled,
            onStage: (stage) => publish({ lifecycle: stage }),
            onMembershipWait: (cancel) => {
              current.cancelMembershipWait = cancel;
            },
            onJoinStarted: () => {
              current.matrixJoinStarted = true;
            },
          });

          current.provider.setLocalOutboundIdentity(joined.ownMembership?.rtcBackendIdentity);
          if (current.e2eeFailure || current.provider.getKeyState().lastImportFailure) {
            failure = 'e2ee-import-failed';
          } else if (!current.cancelled) {
            publish({ lifecycle: 'connecting-livekit' });
            current.worker = createWorker();
            current.room = createRoom({
              encryption: {
                keyProvider: current.provider,
                worker: current.worker,
              },
            });
            await current.room.connect(joined.provisioned.url, joined.provisioned.jwt);
            if (current.e2eeFailure) failure = 'e2ee-import-failed';
          }
        }
      }
    } catch {
      failure = current.e2eeFailure ? 'e2ee-import-failed' : 'setup-failed';
    } finally {
      current.resolveResources();
    }

    if (failure) {
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
    let session: MatrixRTCSession;
    let provider: LivekitMatrixKeyProvider;
    try {
      session = connectOptions.mx.matrixRTC.getRoomSession(connectOptions.room);
      provider = createKeyProvider();
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
      provider,
      matrixJoinStarted: false,
      cancelled: false,
      e2eeFailure: false,
      providerDetached: false,
      ownerLease,
      resourcesReady,
      resolveResources,
    };
    record = current;
    current.removeKeyStateListener = current.provider.subscribe((e2ee) => {
      publish({ e2ee });
      if (e2ee.lastImportFailure) {
        current.e2eeFailure = true;
        current.cancelMembershipWait?.();
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
