import type { AutoDiscoveryInfo } from '../../cs-api';
import {
  MatrixRTCSessionEvent,
  type CallMembership,
  type JoinSessionConfig,
  type MatrixClient,
  type MatrixRTCSession,
  type Room,
} from '$types/matrix-sdk';
import {
  connect,
  disconnect,
  onError,
  onState,
  type CallLifecycleError,
  type CallState,
  type ConnectionState,
} from '$plugins/call/callLifecycle';
import { getPreferredLivekitTransport, provisionLivekitToken } from './livekitProvisioning';
import type { NativeCallLifecycle, NativeCallSession } from '$state/nativeCall';

type SetNativeCall = (session: NativeCallSession | undefined) => void;

type NativeCallControllerDependencies = {
  setSession: SetNativeCall;
  connect: typeof connect;
  disconnect: typeof disconnect;
  onState: typeof onState;
  onError: typeof onError;
  getPreferredTransport: typeof getPreferredLivekitTransport;
  provisionToken: typeof provisionLivekitToken;
  connectionId?: () => string;
};

type NativeCallStartOptions = {
  mx: MatrixClient;
  room: Room;
  discovery?: Pick<AutoDiscoveryInfo, 'org.matrix.msc4143.rtc_foci'>;
  elementCallActive: boolean;
  dm: boolean;
  video: boolean;
  ongoing: boolean;
};

type NativeCallRecord = {
  roomId: string;
  connectionId: string;
  session: MatrixRTCSession;
  cancelled: boolean;
  observedActiveState: boolean;
  stateUnlistenPromise?: ReturnType<NativeCallControllerDependencies['onState']>;
  errorUnlistenPromise?: ReturnType<NativeCallControllerDependencies['onError']>;
  cancelMembershipWait?: () => void;
  cleanupPromise?: Promise<void>;
};

const errorMessage = 'Native call setup failed.';
const endedMessage = 'Native call ended.';

type SetupStage = 'MatrixRTC' | 'LiveKit transport' | 'token provisioning' | 'LiveKit connection';

const membershipWaitTimeoutMs = 10_000;

type MembershipWait = {
  promise: Promise<void>;
  cancel: () => void;
};

const waitForOwnMembership = (
  session: MatrixRTCSession,
  userId: string,
  deviceId: string
): MembershipWait => {
  let resolveWait!: () => void;
  let rejectWait!: (reason?: unknown) => void;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let membershipsListenerInstalled = false;
  let membershipErrorListenerInstalled = false;

  const removeListeners = (): void => {
    if (membershipsListenerInstalled) {
      try {
        session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChanged);
      } catch {}
      membershipsListenerInstalled = false;
    }
    if (membershipErrorListenerInstalled) {
      try {
        session.removeListener(
          MatrixRTCSessionEvent.MembershipManagerError,
          handleMembershipManagerError
        );
      } catch {}
      membershipErrorListenerInstalled = false;
    }
  };

  const settle = (settlePromise: () => void): void => {
    if (settled) return;
    settled = true;
    if (timeout !== undefined) clearTimeout(timeout);
    removeListeners();
    settlePromise();
  };

  const handleMembershipsChanged = (
    _oldMemberships: CallMembership[],
    memberships: CallMembership[]
  ): void => {
    if (
      memberships.some(
        (membership) => membership.userId === userId && membership.deviceId === deviceId
      )
    ) {
      settle(resolveWait);
    }
  };

  const handleMembershipManagerError = (): void => {
    settle(() => rejectWait(new Error('MatrixRTC membership publication failed')));
  };

  const promise = new Promise<void>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });

  try {
    session.on(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChanged);
    membershipsListenerInstalled = true;
    session.on(MatrixRTCSessionEvent.MembershipManagerError, handleMembershipManagerError);
    membershipErrorListenerInstalled = true;
    timeout = setTimeout(
      () => settle(() => rejectWait(new Error('MatrixRTC membership publication timed out'))),
      membershipWaitTimeoutMs
    );
  } catch {
    settle(() => rejectWait(new Error('MatrixRTC membership listener setup failed')));
  }

  return {
    promise,
    cancel: () => settle(() => rejectWait(new Error('MatrixRTC membership wait cancelled'))),
  };
};

const setupErrorMessage = (stage: SetupStage): string =>
  `Native call setup failed during ${stage}.`;

const isTerminalState = (state: ConnectionState): boolean => state === 'idle';

const isMatchingConnection = (connectionId: string | null, record: NativeCallRecord): boolean =>
  connectionId === record.connectionId;

const toLifecycle = (state: ConnectionState): NativeCallLifecycle | undefined => {
  if (state === 'connecting' || state === 'connected' || state === 'reconnecting') return state;
  return undefined;
};

export const createNativeCallController = (
  dependencies: Pick<NativeCallControllerDependencies, 'setSession'> &
    Partial<
      Pick<
        NativeCallControllerDependencies,
        | 'connect'
        | 'disconnect'
        | 'onState'
        | 'onError'
        | 'getPreferredTransport'
        | 'provisionToken'
        | 'connectionId'
      >
    >
) => {
  const deps: NativeCallControllerDependencies = {
    ...dependencies,
    connect: dependencies.connect ?? connect,
    disconnect: dependencies.disconnect ?? disconnect,
    onState: dependencies.onState ?? onState,
    onError: dependencies.onError ?? onError,
    getPreferredTransport: dependencies.getPreferredTransport ?? getPreferredLivekitTransport,
    provisionToken: dependencies.provisionToken ?? provisionLivekitToken,
    connectionId: dependencies.connectionId ?? (() => crypto.randomUUID()),
  };
  let activeRecord: NativeCallRecord | undefined;
  let displayedRecord: NativeCallRecord | undefined;

  const isCurrent = (record: NativeCallRecord): boolean =>
    activeRecord === record && !record.cancelled;

  const setSetupError = (roomId: string, error = errorMessage, connectionId = ''): void => {
    try {
      deps.setSession({
        roomId,
        connectionId,
        lifecycle: 'error',
        error,
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
    error?: string
  ): void => {
    if (!isCurrent(record)) return;
    deps.setSession({
      roomId: record.roomId,
      connectionId: record.connectionId,
      lifecycle,
      ...(error ? { error } : {}),
      hangup: () => cleanup(record, undefined, true),
    });
    displayedRecord = record;
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
    if (failure && activeRecord === record) {
      try {
        deps.setSession({
          roomId: record.roomId,
          connectionId: record.connectionId,
          lifecycle: 'error',
          error: failure,
          hangup: () => cleanup(record, undefined, true),
        });
      } catch {}
      displayedRecord = record;
    }

    record.cleanupPromise = (async () => {
      try {
        await deps.disconnect({ connectionId: record.connectionId });
      } catch {}
      try {
        await record.session.leaveRoomSession(5000);
      } catch {}
      await Promise.allSettled([
        record.stateUnlistenPromise?.then((unlisten) => unlisten()) ?? Promise.resolve(),
        record.errorUnlistenPromise?.then((unlisten) => unlisten()) ?? Promise.resolve(),
      ]);
      if (activeRecord === record) {
        activeRecord = undefined;
      }
      if (clear && displayedRecord === record) {
        displayedRecord = undefined;
        try {
          deps.setSession(undefined);
        } catch {}
      }
    })();
    await record.cleanupPromise;
  };

  const handleState = (record: NativeCallRecord, state: CallState): void => {
    if (!isCurrent(record)) return;
    if (isTerminalState(state.state)) {
      if (state.connectionId !== record.connectionId && !record.observedActiveState) return;
      if (state.connectionId !== null && !isMatchingConnection(state.connectionId, record)) return;
      void cleanup(record, endedMessage, false);
      return;
    }
    if (!isMatchingConnection(state.connectionId, record)) return;
    const lifecycle = toLifecycle(state.state);
    if (!lifecycle) return;
    record.observedActiveState = true;
    publish(record, lifecycle);
  };

  const handleError = (record: NativeCallRecord, error: CallLifecycleError): void => {
    if (!isCurrent(record)) return;
    if (!isMatchingConnection(error.connectionId, record)) return;
    void cleanup(record, errorMessage, false);
  };

  const start = async ({
    mx,
    room,
    discovery,
    elementCallActive,
    dm,
    video,
    ongoing,
  }: NativeCallStartOptions) => {
    if (activeRecord || elementCallActive) return;

    let record: NativeCallRecord | undefined;
    let stage: SetupStage = 'MatrixRTC';
    try {
      const deviceId = mx.getDeviceId();
      if (!deviceId) {
        setSetupError(room.roomId, setupErrorMessage(stage));
        return;
      }

      const connectionId = deps.connectionId!();
      const session = mx.matrixRTC.getRoomSession(room);
      record = {
        roomId: room.roomId,
        connectionId,
        session,
        cancelled: false,
        observedActiveState: false,
      };
      const currentRecord = record;
      activeRecord = record;
      publish(record, 'starting');

      record.stateUnlistenPromise = deps.onState((state) => handleState(currentRecord, state));
      record.errorUnlistenPromise = deps.onError((error) => handleError(currentRecord, error));
      await Promise.all([record.stateUnlistenPromise, record.errorUnlistenPromise]);

      stage = 'LiveKit transport';
      const transport = await deps.getPreferredTransport(mx, discovery);
      if (!transport) throw new Error('No LiveKit transport available');

      const userId = mx.getSafeUserId();
      const identity = { userId, deviceId, memberId: `${userId}:${deviceId}` };
      const joinConfig: JoinSessionConfig = {
        callIntent: video ? 'video' : 'audio',
        ...(ongoing ? {} : { notificationType: dm ? 'ring' : 'notification' }),
      };
      stage = 'MatrixRTC';
      const membershipWait = waitForOwnMembership(session, identity.userId, identity.deviceId);
      record.cancelMembershipWait = membershipWait.cancel;
      session.joinRTCSession(identity, [transport], undefined, joinConfig);
      await membershipWait.promise;
      record.cancelMembershipWait = undefined;
      const slotId = session.slotId;
      if (!slotId) throw new Error('MatrixRTC slot was not assigned');
      if (!isCurrent(record)) return;

      stage = 'token provisioning';
      const provisioned = await deps.provisionToken({
        mx,
        roomId: room.roomId,
        slotId,
        deviceId,
        serviceUrl: transport.livekit_service_url,
        memberId: identity.memberId,
        userId: identity.userId,
      });
      if (!isCurrent(record)) return;

      stage = 'LiveKit connection';
      const state = await deps.connect({
        connectionId,
        serverUrl: provisioned.url,
        participantToken: provisioned.jwt,
        audio: true,
        video,
        screenShare: false,
      });
      handleState(record, state);
    } catch {
      if (record) {
        await cleanup(record, setupErrorMessage(stage), false);
      } else {
        setSetupError(room.roomId, setupErrorMessage(stage));
      }
    }
  };

  return { start };
};
