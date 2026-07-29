import { isTauri } from '@tauri-apps/api/core';
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
import {
  getPlatformCapabilities as getPluginPlatformCapabilities,
  onPlatformCallEvent,
  startPlatformLifecycle,
  stopPlatformLifecycle,
  type PlatformCallCapabilities,
  type PlatformCallEvent,
  type PlatformCallFailureCode,
  type PlatformCallRoute,
} from '$plugins/call/platformCallLifecycle';

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
  | 'platform-lifecycle-failed'
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

export type LivekitJsPlatformStartRequest = {
  sessionId: string;
  microphone: boolean;
  playback: boolean;
};

export type LivekitJsPlatformBridge = {
  getCapabilities: () => Promise<PlatformCallCapabilities>;
  start: (request: LivekitJsPlatformStartRequest) => Promise<unknown>;
  stop: (request: { sessionId: string }) => Promise<unknown>;
  onEvent: (handler: (event: PlatformCallEvent) => void) => Promise<() => void>;
};

export type LivekitJsPlatformState = {
  active: boolean;
  focused: boolean;
  route: PlatformCallRoute | null;
  interrupted: boolean;
  mediaReset: boolean;
  failure: PlatformCallFailureCode | null;
};

export type LivekitJsControllerState = {
  lifecycle: LivekitJsControllerLifecycle;
  failure: LivekitJsControllerFailure | null;
  mediaFailure: LivekitJsMediaFailure | null;
  room?: LivekitRoom;
  media?: LivekitJsMediaFacade;
  platform?: LivekitJsPlatformState;
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
  platformBridge?: LivekitJsPlatformBridge;
  createPlatformSessionId?: () => string;
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
  platformSessionId?: string;
  platformCaps?: Promise<PlatformCallCapabilities>;
  platformActive: boolean;
  platformFlags: { microphone: boolean; playback: boolean };
  platformDesired: { microphone: boolean; playback: boolean };
  platformRevision: number;
  platformUnlisten?: () => void;
  platformEventOp?: Promise<void>;
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

const tauriPlatformBridge: LivekitJsPlatformBridge = {
  getCapabilities: getPluginPlatformCapabilities,
  start: startPlatformLifecycle,
  stop: stopPlatformLifecycle,
  onEvent: onPlatformCallEvent,
};

// Browser builds have no platform lifecycle plugin: manual media uses browser
// getUserMedia directly and the bridge reports explicit unsupported without
// touching Tauri invoke.
const browserPlatformBridge: LivekitJsPlatformBridge = {
  getCapabilities: async () => ({ supported: false, microphone: false, playback: false }),
  start: async () => Promise.reject(new Error('platform lifecycle is unavailable in browser')),
  stop: async () => Promise.reject(new Error('platform lifecycle is unavailable in browser')),
  onEvent: async () => () => undefined,
};

const createDefaultPlatformBridge = (): LivekitJsPlatformBridge =>
  isTauri() ? tauriPlatformBridge : browserPlatformBridge;

let platformSessionCounter = 0;
const defaultCreatePlatformSessionId = (): string => {
  platformSessionCounter += 1;
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${platformSessionCounter.toString(36)}`;
  return `livekit-js-platform-${random}`;
};

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
  const platformBridge = dependencies.platformBridge ?? createDefaultPlatformBridge();
  const createPlatformSessionId =
    dependencies.createPlatformSessionId ?? defaultCreatePlatformSessionId;
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
      const stopPlatform = async (): Promise<void> => {
        if (current.platformEventOp) {
          try {
            await current.platformEventOp;
          } catch {
            // Event settling must not block platform stop.
          }
        }
        if (current.platformActive && current.platformSessionId) {
          try {
            await platformBridge.stop({ sessionId: current.platformSessionId });
          } catch {
            // Platform stop failures never block room/provider cleanup.
          }
          current.platformActive = false;
        }
        current.platformUnlisten?.();
        current.platformUnlisten = undefined;
        publish({ platform: undefined });
      };
      if (current.matrixJoinStarted) {
        await disconnectLivekitThenLeaveMatrixRTC(async () => {
          try {
            await stopRoom();
          } finally {
            await stopPlatform();
            detachProvider();
          }
        }, current.session);
      } else {
        try {
          await stopRoom();
        } catch {
          // Cleanup continues even when a setup room rejects disconnect.
        } finally {
          await stopPlatform();
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

  const publishPlatform = (current: ControllerRecord, patch: Partial<LivekitJsPlatformState>) => {
    if (record !== current) return;
    const base: LivekitJsPlatformState = state.platform ?? {
      active: current.platformActive,
      focused: true,
      route: null,
      interrupted: false,
      mediaReset: false,
      failure: null,
    };
    publish({ platform: { ...base, ...patch } });
  };

  const getPlatformCapabilities = (
    current: ControllerRecord
  ): Promise<PlatformCallCapabilities> => {
    if (!current.platformCaps) {
      current.platformCaps = platformBridge.getCapabilities();
    }
    return current.platformCaps;
  };

  const applyPlatformEvent = async (
    current: ControllerRecord,
    event: PlatformCallEvent
  ): Promise<void> => {
    if (current.cancelled || event.sessionId !== current.platformSessionId) return;
    if (event.revision <= current.platformRevision) return;
    current.platformRevision = event.revision;
    switch (event.type) {
      case 'focus_changed':
        publishPlatform(current, { focused: event.focused });
        break;
      case 'route_changed':
        publishPlatform(current, { route: event.route });
        break;
      case 'interrupted':
        publishPlatform(current, { interrupted: event.state === 'began' });
        break;
      case 'media_reset':
        publishPlatform(current, { mediaReset: true });
        break;
      case 'failed': {
        // Native code never controls tracks; JS fails the manual test safely.
        current.platformActive = false;
        publishPlatform(current, { active: false, failure: event.code });
        publish({ mediaFailure: 'platform-lifecycle-failed' });
        const participant = current.room?.localParticipant;
        if (participant && current.mediaPublished) {
          try {
            await participant.setMicrophoneEnabled(false);
            await participant.setCameraEnabled(false);
            await participant.setScreenShareEnabled(false);
          } catch {
            // Disconnect cleanup unpublishes any remaining tracks.
          }
        }
        break;
      }
      default:
        break;
    }
  };

  const ensurePlatformListener = async (current: ControllerRecord): Promise<void> => {
    if (current.platformUnlisten) return;
    const unlisten = await platformBridge.onEvent((event) => {
      current.platformEventOp = applyPlatformEvent(current, event).finally(() => {
        current.platformEventOp = undefined;
      });
    });
    if (current.cancelled || !current.platformActive) {
      unlisten();
      return;
    }
    current.platformUnlisten = unlisten;
  };

  const ensurePlatformLifecycle = async (current: ControllerRecord): Promise<void> => {
    let capabilities: PlatformCallCapabilities;
    try {
      capabilities = await getPlatformCapabilities(current);
    } catch {
      // A rejected capability request is not the desktop no-op case.
      throw new LivekitJsMediaError('platform-lifecycle-failed');
    }
    if (
      !capabilities ||
      typeof capabilities.supported !== 'boolean' ||
      typeof capabilities.microphone !== 'boolean' ||
      typeof capabilities.playback !== 'boolean'
    ) {
      // A malformed capability result fails closed like a rejection.
      throw new LivekitJsMediaError('platform-lifecycle-failed');
    }
    if (!capabilities.supported || current.cancelled) return;

    const desired = { ...current.platformDesired };
    if (
      current.platformActive &&
      current.platformFlags.microphone === desired.microphone &&
      current.platformFlags.playback === desired.playback
    ) {
      return;
    }

    try {
      if (current.platformActive && current.platformSessionId) {
        await platformBridge.stop({ sessionId: current.platformSessionId });
        current.platformActive = false;
      }
      if (!current.platformSessionId) current.platformSessionId = createPlatformSessionId();
      await platformBridge.start({ sessionId: current.platformSessionId, ...desired });
      current.platformFlags = desired;
      current.platformActive = true;
      publishPlatform(current, { active: true, failure: null });
      await ensurePlatformListener(current);
    } catch {
      current.platformActive = false;
      publishPlatform(current, { active: false });
      throw new LivekitJsMediaError('platform-lifecycle-failed');
    }
  };

  const runMediaAction = async (
    action: (participant: LivekitLocalParticipantLike) => Promise<unknown>,
    platformOrder: 'platform-first' | 'platform-after' = 'platform-first'
  ): Promise<void> => {
    let current: ControllerRecord;
    let participant: LivekitLocalParticipantLike;
    try {
      participant = requireMediaParticipant();
      // requireMediaParticipant guarantees an active record; narrow for TS.
      if (!record) throw new LivekitJsMediaError('room-not-active');
      current = record;
      if (platformOrder === 'platform-first') await ensurePlatformLifecycle(current);
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
    if (platformOrder === 'platform-after') {
      try {
        await ensurePlatformLifecycle(current);
      } catch (error) {
        if (error instanceof LivekitJsMediaError) publish({ mediaFailure: error.code });
        throw error;
      }
    }
    publish({ mediaFailure: null });
  };

  const markMediaPublished = (promise: Promise<void>, published: boolean): Promise<void> =>
    promise.then(() => {
      if (published && record) record.mediaPublished = true;
    });

  const setMicrophoneEnabled = (enabled: boolean): Promise<void> => {
    if (record) record.platformDesired.microphone = enabled;
    const promise = markMediaPublished(
      // A microphone disable must unpublish the JS track before the platform
      // lifecycle is stopped or downgraded.
      runMediaAction(
        (participant) => participant.setMicrophoneEnabled(enabled),
        enabled ? 'platform-first' : 'platform-after'
      ),
      enabled
    );
    if (enabled) return promise;
    return promise.catch((error) => {
      // The JS track failed to disable, so the microphone may still be
      // live: retain the microphone platform lifecycle.
      if (
        record &&
        error instanceof LivekitJsMediaError &&
        error.code === 'media-operation-failed'
      ) {
        record.platformDesired.microphone = true;
      }
      throw error;
    });
  };

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
      platformActive: false,
      platformFlags: { microphone: false, playback: false },
      platformDesired: { microphone: false, playback: true },
      platformRevision: -1,
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
