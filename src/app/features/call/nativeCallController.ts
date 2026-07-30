import type { AutoDiscoveryInfo } from '../../cs-api';
import type { MatrixClient, MatrixRTCSession, Room } from '$types/matrix-sdk';
import {
  connectNativeCall,
  disconnectNativeCall,
  listenNativeCallSnapshot,
  setNativeCallCameraEnabled,
  setNativeCallEncryptionKey,
  setNativeCallMicrophoneEnabled,
  type NativeCallEncryptionKeyPayload,
  type NativeCallSnapshot,
} from './livekitMobileBridge';
import { getPreferredLivekitTransport, provisionLivekitToken } from './livekitProvisioning';
import {
  createNativeCallKeyForwarder,
  type NativeCallKeyForwarder,
} from './nativeCallKeyForwarder';
import {
  joinAndProvisionMatrixRTC,
  disconnectLivekitThenLeaveMatrixRTC,
} from './matrixRtcCallLifecycle';
import { acquireCallOwner, type CallOwnerLease } from '$state/callOwner';
import type { NativeCallLifecycle, NativeCallSession } from '$state/nativeCall';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('nativeCallController');

type SetupStage = 'joining the call' | 'authorizing' | 'connecting';

const setupErrorMessage = (stage: SetupStage): string =>
  `Native call setup failed during ${stage}.`;
const failedMessage = 'Native call connection failed.';
const endedMessage = 'Native call ended.';

const logFailure = (message: string): void => {
  debugLog.error('call', message);
};

export type NativeCallStartOptions = {
  mx: MatrixClient;
  room: Room;
  discovery?: Pick<AutoDiscoveryInfo, 'org.matrix.msc4143.rtc_foci'>;
  dm: boolean;
  video: boolean;
  microphone: boolean;
  ongoing: boolean;
};

type NativeCallRecord = {
  roomId: string;
  callId: string;
  session: MatrixRTCSession;
  forwarder: NativeCallKeyForwarder;
  ownerLease: CallOwnerLease;
  video: boolean;
  cancelled: boolean;
  connectResolved: boolean;
  sentKeyIndices: Map<string, number>;
  cancelMembershipWait?: () => void;
  snapshotUnlistenPromise?: Promise<() => void>;
  cleanupPromise?: Promise<void>;
};

export type NativeCallController = {
  start: (options: NativeCallStartOptions) => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
};

export type NativeCallControllerDependencies = {
  setSession: (session: NativeCallSession | undefined) => void;
  connectCall?: typeof connectNativeCall;
  disconnectCall?: typeof disconnectNativeCall;
  setMicrophone?: typeof setNativeCallMicrophoneEnabled;
  setCamera?: typeof setNativeCallCameraEnabled;
  setEncryptionKey?: typeof setNativeCallEncryptionKey;
  listenSnapshot?: typeof listenNativeCallSnapshot;
  createKeyForwarder?: () => NativeCallKeyForwarder;
  getPreferredTransport?: typeof getPreferredLivekitTransport;
  provisionToken?: typeof provisionLivekitToken;
  createCallId?: () => string;
  acquireOwner?: typeof acquireCallOwner;
  onCleanup?: () => void;
};

const noMediaControls = {
  setMicrophoneEnabled: async (): Promise<void> => {},
  setCameraEnabled: async (): Promise<void> => {},
};

const toLifecycle = (
  state: NativeCallSnapshot['connectionState']
): NativeCallLifecycle | undefined => {
  if (state === 'connecting' || state === 'connected' || state === 'reconnecting') return state;
  return undefined;
};

export const createNativeCallController = (
  dependencies: Pick<NativeCallControllerDependencies, 'setSession'> &
    Omit<NativeCallControllerDependencies, 'setSession'>
): NativeCallController => {
  const deps = {
    ...dependencies,
    connectCall: dependencies.connectCall ?? connectNativeCall,
    disconnectCall: dependencies.disconnectCall ?? disconnectNativeCall,
    setMicrophone: dependencies.setMicrophone ?? setNativeCallMicrophoneEnabled,
    setCamera: dependencies.setCamera ?? setNativeCallCameraEnabled,
    setEncryptionKey: dependencies.setEncryptionKey ?? setNativeCallEncryptionKey,
    listenSnapshot: dependencies.listenSnapshot ?? listenNativeCallSnapshot,
    createKeyForwarder: dependencies.createKeyForwarder ?? createNativeCallKeyForwarder,
    getPreferredTransport: dependencies.getPreferredTransport ?? getPreferredLivekitTransport,
    provisionToken: dependencies.provisionToken ?? provisionLivekitToken,
    createCallId: dependencies.createCallId ?? (() => crypto.randomUUID()),
    acquireOwner: dependencies.acquireOwner ?? acquireCallOwner,
  };

  let activeRecord: NativeCallRecord | undefined;
  let displayedRecord: NativeCallRecord | undefined;

  const isCurrent = (record: NativeCallRecord): boolean =>
    activeRecord === record && !record.cancelled;

  const setSetupError = (roomId: string, callId: string, error: string): void => {
    try {
      deps.setSession({
        backend: 'livekit-mobile',
        roomId,
        callId,
        lifecycle: 'error',
        error,
        microphoneEnabled: false,
        cameraEnabled: false,
        ...noMediaControls,
        hangup: async () => {
          try {
            deps.setSession(undefined);
          } catch {}
        },
      });
    } catch {}
  };

  const publish = (
    record: NativeCallRecord,
    lifecycle: NativeCallLifecycle,
    media?: { microphoneEnabled: boolean; cameraEnabled: boolean },
    error?: string
  ): void => {
    if (!isCurrent(record)) return;
    deps.setSession({
      backend: 'livekit-mobile',
      roomId: record.roomId,
      callId: record.callId,
      lifecycle,
      ...(error ? { error } : {}),
      microphoneEnabled: media?.microphoneEnabled ?? true,
      cameraEnabled: media?.cameraEnabled ?? false,
      setMicrophoneEnabled,
      setCameraEnabled,
      hangup: () => cleanup(record, undefined, true),
    });
    displayedRecord = record;
  };

  const forwardKey = (record: NativeCallRecord, key: NativeCallEncryptionKeyPayload): void => {
    if (!record.connectResolved || record.cancelled) return;
    const sentIndex = record.sentKeyIndices.get(key.identity) ?? -1;
    if (key.keyIndex <= sentIndex) return;
    record.sentKeyIndices.set(key.identity, key.keyIndex);
    void deps
      .setEncryptionKey({
        callId: record.callId,
        identity: key.identity,
        keyIndex: key.keyIndex,
        key: key.key,
      })
      .catch(() => undefined);
  };

  const cleanup = async (
    record: NativeCallRecord,
    failure: string | undefined,
    clear: boolean
  ): Promise<void> => {
    if (record.cleanupPromise) {
      await record.cleanupPromise;
      if (clear && displayedRecord === record) {
        displayedRecord = undefined;
        try {
          deps.setSession(undefined);
        } catch {}
      }
      return;
    }

    record.cancelled = true;
    record.cancelMembershipWait?.();
    record.cancelMembershipWait = undefined;
    record.forwarder.setOnKey(undefined);
    if (failure && activeRecord === record) {
      try {
        deps.setSession({
          backend: 'livekit-mobile',
          roomId: record.roomId,
          callId: record.callId,
          lifecycle: 'error',
          error: failure,
          microphoneEnabled: false,
          cameraEnabled: false,
          ...noMediaControls,
          hangup: () => cleanup(record, undefined, true),
        });
      } catch {}
      displayedRecord = record;
    }

    record.cleanupPromise = (async () => {
      await disconnectLivekitThenLeaveMatrixRTC(
        () => deps.disconnectCall({ callId: record.callId }).then(() => undefined),
        record.session
      );
      await Promise.allSettled([
        record.snapshotUnlistenPromise?.then((unlisten) => unlisten()) ?? Promise.resolve(),
      ]);
      record.forwarder.detach();
      record.ownerLease.release();
      if (activeRecord === record) activeRecord = undefined;
      if (clear && displayedRecord === record) {
        displayedRecord = undefined;
        try {
          deps.setSession(undefined);
        } catch {}
      }
      deps.onCleanup?.();
    })();
    await record.cleanupPromise;
  };

  const handleSnapshot = (record: NativeCallRecord, snapshot: NativeCallSnapshot): void => {
    if (!isCurrent(record)) return;
    if (snapshot.connectionState === 'idle' || snapshot.connectionState === 'failed') {
      if (snapshot.callId === null && !record.connectResolved) return;
      if (snapshot.callId !== null && snapshot.callId !== record.callId) return;
      if (snapshot.connectionState === 'failed') logFailure(failedMessage);
      void cleanup(
        record,
        snapshot.connectionState === 'failed' ? failedMessage : endedMessage,
        false
      );
      return;
    }
    if (snapshot.callId !== record.callId) return;
    const lifecycle = toLifecycle(snapshot.connectionState);
    if (!lifecycle) return;
    publish(record, lifecycle, {
      microphoneEnabled: snapshot.microphoneEnabled,
      cameraEnabled: snapshot.cameraEnabled,
    });
  };

  const start = async ({
    mx,
    room,
    discovery,
    dm,
    video,
    microphone,
    ongoing,
  }: NativeCallStartOptions) => {
    if (activeRecord) {
      deps.onCleanup?.();
      return;
    }
    const ownerLease = deps.acquireOwner('livekit-mobile', room.roomId);
    if (!ownerLease) {
      deps.onCleanup?.();
      return;
    }

    let record: NativeCallRecord | undefined;
    let stage: SetupStage = 'joining the call';
    try {
      const callId = deps.createCallId();
      const session = mx.matrixRTC.getRoomSession(room);
      const forwarder = deps.createKeyForwarder();
      record = {
        roomId: room.roomId,
        callId,
        session,
        forwarder,
        ownerLease,
        video,
        cancelled: false,
        connectResolved: false,
        sentKeyIndices: new Map(),
      };
      const currentRecord = record;
      activeRecord = record;
      publish(record, 'starting');

      record.snapshotUnlistenPromise = deps.listenSnapshot((snapshot) =>
        handleSnapshot(currentRecord, snapshot)
      );
      await record.snapshotUnlistenPromise;

      forwarder.attach(session);

      const joined = await joinAndProvisionMatrixRTC({
        mx,
        room,
        session,
        discovery,
        getPreferredTransport: deps.getPreferredTransport,
        provisionToken: deps.provisionToken,
        callIntent: video ? 'video' : 'audio',
        ...(ongoing ? {} : { notificationType: dm ? 'ring' : 'notification' }),
        manageMediaKeys: true,
        isCancelled: () => !isCurrent(currentRecord),
        onStage: (joinStage) => {
          stage = joinStage === 'joining-matrix' ? 'joining the call' : 'authorizing';
        },
        onMembershipWait: (cancel) => {
          currentRecord.cancelMembershipWait = cancel;
        },
      });
      if (!isCurrent(currentRecord)) return;

      forwarder.setLocalOutboundIdentity(joined.ownMembership?.rtcBackendIdentity);

      stage = 'connecting';
      await forwarder.waitForOwnKey();
      if (!isCurrent(currentRecord)) return;

      const encryptionKeys = forwarder.getKeys();
      encryptionKeys.forEach((key) => {
        currentRecord.sentKeyIndices.set(key.identity, key.keyIndex);
      });
      const snapshot = await deps.connectCall({
        callId,
        url: joined.provisioned.url,
        token: joined.provisioned.jwt,
        microphoneEnabled: microphone,
        encryptionKeys,
      });
      currentRecord.connectResolved = true;
      forwarder.setOnKey((key) => forwardKey(currentRecord, key));
      forwarder.getKeys().forEach((key) => forwardKey(currentRecord, key));
      handleSnapshot(currentRecord, snapshot);

      if (video && isCurrent(currentRecord)) {
        await deps.setCamera({ callId, enabled: true }).catch(() => undefined);
      }
    } catch {
      logFailure(setupErrorMessage(stage));
      if (record) {
        await cleanup(record, setupErrorMessage(stage), false);
      } else {
        ownerLease.release();
        setSetupError(room.roomId, '', setupErrorMessage(stage));
        deps.onCleanup?.();
      }
    }
  };

  const setMicrophoneEnabled = async (enabled: boolean): Promise<void> => {
    const record = activeRecord;
    if (!record || record.cancelled || !record.connectResolved) return;
    await deps.setMicrophone({ callId: record.callId, enabled }).catch(() => undefined);
  };

  const setCameraEnabled = async (enabled: boolean): Promise<void> => {
    const record = activeRecord;
    if (!record || record.cancelled || !record.connectResolved) return;
    await deps.setCamera({ callId: record.callId, enabled }).catch(() => undefined);
  };

  return { start, setMicrophoneEnabled, setCameraEnabled };
};
