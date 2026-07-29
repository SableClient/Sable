import type { AutoDiscoveryInfo } from '../../cs-api';
import { type MatrixClient, type MatrixRTCSession, type Room } from '$types/matrix-sdk';
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
import { createDebugLogger } from '$utils/debugLogger';
import {
  joinAndProvisionMatrixRTC,
  disconnectLivekitThenLeaveMatrixRTC,
} from './matrixRtcCallLifecycle';

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
  onCleanup?: () => void;
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

const debugLog = createDebugLogger('nativeCallController');

const errorMessage = 'Native call setup failed.';
const endedMessage = 'Native call ended.';

type SetupStage =
  | 'joining the call'
  | 'no transport'
  | 'authorizing'
  | 'connecting'
  | 'media control';

const safeErrorNames = new Set([
  'AggregateError',
  'AbortError',
  'DataError',
  'DOMException',
  'Error',
  'EvalError',
  'InvalidStateError',
  'NetworkError',
  'NotAllowedError',
  'NotSupportedError',
  'OperationError',
  'QuotaExceededError',
  'RangeError',
  'ReferenceError',
  'SecurityError',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
  'URIError',
  'UnknownError',
]);

const safeErrorMessages = new Set([
  'MatrixRTC device unavailable',
  'MatrixRTC membership listener setup failed',
  'MatrixRTC membership publication failed',
  'MatrixRTC membership wait cancelled',
  'media kind is not supported on this platform',
  'native audio failed',
  'native camera failed',
  'native screen share failed',
  'native video failed',
  'MatrixRTC slot was not assigned',
  'No LiveKit transport available',
]);

const safeLifecycleErrorCodes = new Set([
  'actor_unavailable',
  'audio_failed',
  'busy',
  'camera_failed',
  'close_failed',
  'connect_failed',
  'media_unsupported',
  'screen_share_failed',
  'stale_connection',
  'video_failed',
]);

const mediaControlErrorCodes = new Set([
  'audio_failed',
  'camera_failed',
  'media_unsupported',
  'screen_share_failed',
  'video_failed',
]);

const isMediaControlError = (error: CallLifecycleError): boolean =>
  typeof error.code === 'string' && mediaControlErrorCodes.has(error.code);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getErrorProperty = (error: unknown, property: 'name' | 'message' | 'cause'): unknown => {
  if (error instanceof Error) return error[property];
  return isRecord(error) ? error[property] : undefined;
};

const safeErrorName = (error: unknown): string => {
  const name = getErrorProperty(error, 'name');
  return typeof name === 'string' && safeErrorNames.has(name) ? name : 'UnknownError';
};

const safeErrorMessage = (error: unknown): string => {
  const message = getErrorProperty(error, 'message');
  return typeof message === 'string' && safeErrorMessages.has(message) ? message : 'redacted';
};

const setupFailureDiagnostics = (stage: SetupStage, error: unknown): Record<string, unknown> => {
  const cause = getErrorProperty(error, 'cause');
  return {
    stage,
    errorName: safeErrorName(error),
    errorMessage: safeErrorMessage(error),
    ...(cause !== undefined
      ? {
          cause: {
            errorName: safeErrorName(cause),
            errorMessage: safeErrorMessage(cause),
          },
        }
      : {}),
  };
};

const logSetupFailure = (stage: SetupStage, error: unknown): void => {
  debugLog.error('call', 'Native call setup failed', setupFailureDiagnostics(stage, error));
};

const safeLifecycleErrorCode = (code: unknown): string =>
  typeof code === 'string' && safeLifecycleErrorCodes.has(code) ? code : 'unknown';

const lifecycleFailureDiagnostics = (error: CallLifecycleError): Record<string, unknown> => ({
  ...setupFailureDiagnostics(isMediaControlError(error) ? 'media control' : 'connecting', error),
  code: safeLifecycleErrorCode(error.code),
});

const logLifecycleFailure = (error: CallLifecycleError): void => {
  debugLog.error('call', 'Native call connection failed', lifecycleFailureDiagnostics(error));
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
        | 'onCleanup'
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
    onCleanup: dependencies.onCleanup,
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
      await disconnectLivekitThenLeaveMatrixRTC(
        () => deps.disconnect({ connectionId: record.connectionId }).then(() => undefined),
        record.session
      );
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
      deps.onCleanup?.();
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
    logLifecycleFailure(error);
    // Media toggle failures are recoverable: keep the call alive and only
    // record a safe diagnostic.
    if (isMediaControlError(error)) return;
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
    if (activeRecord || elementCallActive) {
      deps.onCleanup?.();
      return;
    }

    let record: NativeCallRecord | undefined;
    let stage: SetupStage = 'joining the call';
    try {
      const deviceId = mx.getDeviceId();
      if (!deviceId) {
        throw new Error('MatrixRTC device unavailable');
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

      stage = 'no transport';
      const joined = await joinAndProvisionMatrixRTC({
        mx,
        room,
        session,
        discovery,
        getPreferredTransport: deps.getPreferredTransport,
        provisionToken: deps.provisionToken,
        callIntent: video ? 'video' : 'audio',
        ...(ongoing ? {} : { notificationType: dm ? 'ring' : 'notification' }),
        isCancelled: () => !isCurrent(currentRecord),
        onStage: (joinStage) => {
          stage = joinStage === 'joining-matrix' ? 'joining the call' : 'authorizing';
        },
        onMembershipWait: (cancel) => {
          currentRecord.cancelMembershipWait = cancel;
        },
        onMembershipError: (error) => logSetupFailure('joining the call', error),
      });
      if (!isCurrent(currentRecord)) return;

      stage = 'connecting';
      const state = await deps.connect({
        connectionId,
        serverUrl: joined.provisioned.url,
        participantToken: joined.provisioned.jwt,
        audio: true,
        video,
        screenShare: false,
      });
      handleState(currentRecord, state);
    } catch (error) {
      logSetupFailure(stage, error);
      if (record) {
        await cleanup(record, setupErrorMessage(stage), false);
      } else {
        setSetupError(room.roomId, setupErrorMessage(stage));
        deps.onCleanup?.();
      }
    }
  };

  return { start };
};
