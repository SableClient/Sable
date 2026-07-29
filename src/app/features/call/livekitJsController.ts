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

export type LivekitJsMediaFailure =
  | 'media-test-disabled'
  | 'e2ee-unsupported'
  | 'e2ee-key-not-ready'
  | 'e2ee-key-failed'
  | 'room-not-active'
  | 'media-operation-failed';

export class LivekitJsMediaError extends Error {
  public constructor(public readonly code: LivekitJsMediaFailure) {
    super(`LiveKit JS media test refused: ${code}`);
    this.name = 'LivekitJsMediaError';
  }
}

export type LivekitJsMediaFacade = {
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
};

export type LivekitJsControllerState = {
  lifecycle: LivekitJsControllerLifecycle;
  failure: LivekitJsControllerFailure | null;
  mediaFailure: LivekitJsMediaFailure | null;
  room?: LivekitRoom;
  media?: LivekitJsMediaFacade;
  e2ee: Readonly<LivekitMatrixKeyProviderState>;
};

export type LivekitJsControllerStateListener = (state: Readonly<LivekitJsControllerState>) => void;

export type LivekitJsConnectOptions = {
  mx: MatrixClient;
  room: MatrixRoom;
  discovery?: Pick<AutoDiscoveryInfo, 'org.matrix.msc4143.rtc_foci'>;
  callIntent?: 'audio' | 'video';
  dm?: boolean;
  ongoing?: boolean;
};

type LivekitLocalParticipantLike = Pick<
  LivekitRoom['localParticipant'],
  'setMicrophoneEnabled' | 'setCameraEnabled' | 'setScreenShareEnabled'
>;

type LivekitRoomLike = Pick<LivekitRoom, 'connect' | 'disconnect'> & {
  localParticipant?: LivekitLocalParticipantLike;
};

type ManualMediaMethods = LivekitJsMediaFacade;

type LivekitJsControllerBase = {
  connect: (options: LivekitJsConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;
  getState: () => Readonly<LivekitJsControllerState>;
  subscribe: (listener: LivekitJsControllerStateListener) => () => void;
};

type LivekitJsManualController = LivekitJsControllerBase & ManualMediaMethods;

export type LivekitJsControllerOptions = {
  manualMediaTest?: boolean;
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
  mediaPublished: boolean;
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
  new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), { type: 'module' });

export function createLivekitJsController(
  dependencies: LivekitJsControllerDependencies | undefined,
  options: { manualMediaTest: true }
): LivekitJsManualController;
export function createLivekitJsController(
  dependencies?: LivekitJsControllerDependencies,
  options?: LivekitJsControllerOptions
): LivekitJsControllerBase;
export function createLivekitJsController(
  dependencies: LivekitJsControllerDependencies = {},
  controllerOptions: LivekitJsControllerOptions = {}
) {
  const createRoom = dependencies.createRoom ?? defaultCreateRoom;
  const createWorker = dependencies.createWorker ?? defaultCreateWorker;
  const createKeyProvider =
    dependencies.createKeyProvider ?? (() => new LivekitMatrixKeyProvider());
  const supportsE2EE = dependencies.isE2EESupported ?? isLivekitE2EESupported;
  const getPreferredTransport = dependencies.getPreferredTransport ?? getPreferredLivekitTransport;
  const provisionToken = dependencies.provisionToken ?? provisionLivekitToken;
  const manualMediaTest = controllerOptions.manualMediaTest === true;

  let state: LivekitJsControllerState = {
    lifecycle: 'idle',
    failure: null,
    mediaFailure: null,
    room: undefined,
    media: undefined,
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
        if (current.mediaPublished && current.room?.localParticipant) {
          try {
            await current.room.localParticipant.setMicrophoneEnabled(false);
            await current.room.localParticipant.setCameraEnabled(false);
            await current.room.localParticipant.setScreenShareEnabled(false);
          } catch {
            // Best-effort unpublish; disconnect clears any remaining tracks.
          }
        }
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
        mediaFailure: result === 'idle' ? null : state.mediaFailure,
        room: undefined,
        media: undefined,
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
              : { notificationType: connectOptions.dm ? 'ring' : 'notification' }),
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
        media: manualMediaTest
          ? {
              setMicrophoneEnabled,
              setCameraEnabled,
              setScreenShareEnabled,
            }
          : undefined,
      });
    }
  };

  const requireMediaParticipant = (): LivekitLocalParticipantLike => {
    if (!manualMediaTest) throw new LivekitJsMediaError('media-test-disabled');
    if (!supportsE2EE()) throw new LivekitJsMediaError('e2ee-unsupported');
    if (state.lifecycle !== 'active' || !record?.room?.localParticipant) {
      throw new LivekitJsMediaError('room-not-active');
    }

    const keyState = record.provider.getKeyState();
    if (keyState.lastImportFailure) throw new LivekitJsMediaError('e2ee-key-failed');
    if (!keyState.ready || !keyState.localOutboundIdentity) {
      throw new LivekitJsMediaError('e2ee-key-not-ready');
    }
    return record.room.localParticipant;
  };

  const runMediaAction = async (
    action: (participant: LivekitLocalParticipantLike) => Promise<unknown>
  ): Promise<void> => {
    let participant: LivekitLocalParticipantLike;
    try {
      participant = requireMediaParticipant();
    } catch (error) {
      if (error instanceof LivekitJsMediaError) publish({ mediaFailure: error.code });
      throw error;
    }

    try {
      await action(participant);
    } catch {
      const error = new LivekitJsMediaError('media-operation-failed');
      publish({ mediaFailure: error.code });
      throw error;
    }
    publish({ mediaFailure: null });
  };

  const markMediaPublished = (promise: Promise<void>, published: boolean): Promise<void> =>
    promise.then(() => {
      if (published && record) record.mediaPublished = true;
    });

  const setMicrophoneEnabled = (enabled: boolean): Promise<void> =>
    markMediaPublished(
      runMediaAction((participant) => participant.setMicrophoneEnabled(enabled)),
      enabled
    );

  const setCameraEnabled = (enabled: boolean): Promise<void> =>
    markMediaPublished(
      runMediaAction((participant) => participant.setCameraEnabled(enabled)),
      enabled
    );

  const setScreenShareEnabled = (enabled: boolean): Promise<void> =>
    markMediaPublished(
      runMediaAction((participant) => participant.setScreenShareEnabled(enabled)),
      enabled
    );

  const connect = (connectOptions: LivekitJsConnectOptions): Promise<void> => {
    if (state.lifecycle === 'failed' && !record && !operation) {
      publish({
        lifecycle: 'idle',
        failure: null,
        mediaFailure: null,
        room: undefined,
        media: undefined,
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
        mediaFailure: null,
        room: undefined,
        media: undefined,
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
        mediaFailure: null,
        room: undefined,
        media: undefined,
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
      mediaPublished: false,
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
        publish({ lifecycle: 'idle', failure: null, mediaFailure: null });
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

  if (!manualMediaTest) return controller;
  return {
    ...controller,
    setMicrophoneEnabled,
    setCameraEnabled,
    setScreenShareEnabled,
  };
}
