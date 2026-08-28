import {
  type CallKeyPipeline,
  type CallSessionHandles,
  type CallTransportState,
  callEncryptsMedia,
  createCallKeyPipeline,
  createCallSessionHandles,
  disconnectLivekitThenLeaveMatrixRTC,
  getPreferredLivekitTransport,
  joinCallSession,
  provisionLivekitToken,
} from '@sableclient/matrixrtc';
import type { AutoDiscoveryInfo } from '../../cs-api';
import type { MatrixClient, MatrixRTCSession, Room } from '$types/matrix-sdk';
import {
  drainPendingSystemCallActions,
  endSystemCall,
  fulfillAnswerCall,
  fulfillEndCall,
  onSystemCallAction,
  reportSystemCallConnected,
  setSystemCallMuted,
  startSystemCall,
  updateCallDisplay,
  type NativeCallAudioRoute,
  type NativeCallCapabilities as PluginNativeCallCapabilities,
  type SystemCallAction,
} from '@sableclient/tauri-plugin-livekit-mobile';
import {
  createNativeTransport,
  type NativeCallTransport,
  type NativeTransportDependencies,
} from './nativeTransport';
import { acquireCallOwner, type CallOwnerLease } from '$state/callOwner';
import type { NativeCallLifecycle, NativeCallSession } from '$state/nativeCall';
import { createDebugLogger } from '$utils/debugLogger';
import { getSlidingSyncManager } from '$client/initMatrix';
import { fetch as appFetch } from '$utils/fetch';

const debugLog = createDebugLogger('nativeCallController');

type SetupStage = 'joining-matrix' | 'authorizing' | 'connecting-livekit';

const setupStageLabels: Record<SetupStage, string> = {
  'joining-matrix': 'joining the call',
  authorizing: 'authorizing',
  'connecting-livekit': 'connecting',
};

const setupErrorMessages: Record<SetupStage, string> = {
  'joining-matrix': 'Could not join the call.',
  authorizing: 'Could not get permission to join the call.',
  'connecting-livekit': 'Could not connect to the call.',
};

const ignoreNativeFailure =
  (operation: string) =>
  (cause: unknown): undefined => {
    debugLog.warn('call', `Native call ${operation} failed. ${String(cause)}`);
    return undefined;
  };

export type NativeCallStartOptions = {
  mx: MatrixClient;
  room: Room;
  discovery?: Pick<AutoDiscoveryInfo, 'org.matrix.msc4143.rtc_foci'>;
  dm: boolean;
  video: boolean;
  microphone: boolean;
  ongoing: boolean;
  capabilities?: PluginNativeCallCapabilities;
};

type NativeCallRecord = {
  roomId: string;
  callId: string;
  session: MatrixRTCSession;
  keys: CallKeyPipeline;
  transport: NativeCallTransport;
  unsubscribeTransport: () => void;
  ownerLease: CallOwnerLease;
  cancelled: boolean;
  handles: CallSessionHandles;
  cleanupPromise?: Promise<void>;
  capabilities: PluginNativeCallCapabilities;
};

export type NativeCallController = {
  start: (options: NativeCallStartOptions) => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
  switchCamera: () => Promise<void>;
  listAudioRoutes: () => Promise<NativeCallAudioRoute[]>;
  selectAudioRoute: (routeId: string) => Promise<void>;
};

export type NativeCallControllerDependencies = NativeTransportDependencies & {
  setSession: (session: NativeCallSession | undefined) => void;
  updateDisplay?: typeof updateCallDisplay;
  createKeyPipeline?: () => CallKeyPipeline;
  createTransport?: typeof createNativeTransport;
  getPreferredTransport?: typeof getPreferredLivekitTransport;
  provisionToken?: typeof provisionLivekitToken;
  createCallId?: () => string;
  acquireOwner?: typeof acquireCallOwner;
  onCleanup?: () => void;
};

const noMediaControls = {
  setMicrophoneEnabled: async (): Promise<void> => {},
  setCameraEnabled: async (): Promise<void> => {},
  switchCamera: async (): Promise<void> => {},
  listAudioRoutes: async (): Promise<NativeCallAudioRoute[]> => [],
  selectAudioRoute: async (): Promise<void> => {},
};

export const createNativeCallController = (
  dependencies: NativeCallControllerDependencies
): NativeCallController => {
  const deps = {
    ...dependencies,
    updateDisplay: dependencies.updateDisplay ?? updateCallDisplay,
    createKeyPipeline: dependencies.createKeyPipeline ?? createCallKeyPipeline,
    createTransport: dependencies.createTransport ?? createNativeTransport,
    getPreferredTransport: dependencies.getPreferredTransport ?? getPreferredLivekitTransport,
    provisionToken: dependencies.provisionToken ?? provisionLivekitToken,
    createCallId: dependencies.createCallId ?? (() => crypto.randomUUID()),
    acquireOwner: dependencies.acquireOwner ?? acquireCallOwner,
  };

  // Register the system-call (CallKit) listener once at controller creation.
  // Events (answer, end, mute from lock-screen/system-UI) flow from the
  // native side regardless of call state.
  const pendingSystemUuids = new Map<string, string>();

  const handleSystemCallAction = (action: SystemCallAction): void => {
    if (action.action === 'end') {
      // System UI ended the call: hang up if active, then fulfill the
      // pending CXEndCallAction so the system UI dismisses immediately.
      if (activeRecord && !activeRecord.cancelled) {
        void cleanup(activeRecord, undefined, true).finally(() => {
          if (action.uuid)
            void fulfillEndCall(action.uuid).catch(ignoreNativeFailure('end-call fulfillment'));
        });
      } else if (action.uuid) {
        void fulfillEndCall(action.uuid).catch(ignoreNativeFailure('end-call fulfillment'));
      }
      void drainPendingSystemCallActions().catch(ignoreNativeFailure('pending-action drain'));
    } else if (action.action === 'answer' && action.roomId) {
      pendingSystemUuids.set(action.roomId, action.uuid);
      window.dispatchEvent(
        new CustomEvent('nativeCallAnswer', { detail: { roomId: action.roomId } })
      );
    } else if (action.action === 'mute') {
      // System UI mute toggle: push to LiveKit.
      void activeRecord?.transport.setMicrophoneEnabled(!action.muted);
    }
  };

  void onSystemCallAction(handleSystemCallAction).catch(
    ignoreNativeFailure('system-action subscription')
  );
  void drainPendingSystemCallActions()
    .then((actions) => actions.forEach(handleSystemCallAction))
    .catch(ignoreNativeFailure('pending-action drain'));

  let activeRecord: NativeCallRecord | undefined;
  let displayedRecord: NativeCallRecord | undefined;

  const isCurrent = (record: NativeCallRecord): boolean =>
    activeRecord === record && !record.cancelled;

  const setSession = (session: NativeCallSession | undefined): void => {
    try {
      deps.setSession(session);
    } catch (cause) {
      debugLog.warn('call', `Failed to publish the native call session. ${String(cause)}`);
    }
  };

  const publishError = (
    roomId: string,
    callId: string,
    error: string,
    hangup: () => Promise<void>
  ): void => {
    setSession({
      backend: 'livekit-mobile',
      roomId,
      callId,
      lifecycle: 'error',
      error,
      participants: [],
      microphoneEnabled: false,
      cameraEnabled: false,
      screenShareEnabled: false,
      capabilities: {
        camera: false,
        screenShare: false,
        pictureInPicture: false,
        audioRoutes: false,
      },
      ...noMediaControls,
      hangup,
    });
  };

  const publish = (
    record: NativeCallRecord,
    lifecycle: NativeCallLifecycle,
    media?: Pick<
      CallTransportState,
      'participants' | 'microphoneEnabled' | 'cameraEnabled' | 'screenShareEnabled'
    >
  ): void => {
    if (!isCurrent(record)) return;
    setSession({
      backend: 'livekit-mobile',
      roomId: record.roomId,
      callId: record.callId,
      lifecycle,
      participants: media?.participants ?? [],
      microphoneEnabled: media?.microphoneEnabled ?? true,
      cameraEnabled: media?.cameraEnabled ?? false,
      screenShareEnabled: media?.screenShareEnabled ?? false,
      capabilities: {
        camera: record.capabilities.camera,
        screenShare: record.capabilities.screenShare,
        pictureInPicture: record.capabilities.pictureInPicture,
        audioRoutes: record.capabilities.audioRoutes,
      },
      setMicrophoneEnabled,
      setCameraEnabled,
      ...(record.capabilities.screenShare ? { setScreenShareEnabled } : {}),
      switchCamera,
      listAudioRoutes,
      selectAudioRoute,
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
        setSession(undefined);
      }
      return;
    }

    record.cancelled = true;
    record.handles.cancelMembershipWait?.();
    record.handles.cancelMembershipWait = undefined;
    record.handles.removePageHideListener?.();
    record.handles.removePageHideListener = undefined;
    record.handles.unsubscribeCallRoom?.();
    record.handles.unsubscribeCallRoom = undefined;
    record.unsubscribeTransport();
    record.keys.setOnKey(undefined);
    if (failure && activeRecord === record) {
      publishError(record.roomId, record.callId, failure, () => cleanup(record, undefined, true));
      displayedRecord = record;
    }

    record.cleanupPromise = (async () => {
      // End the system call so CallKit dismisses the active-call UI.
      void endSystemCall({ callId: record.callId, remoteEnded: true }).catch(
        ignoreNativeFailure('system-call end')
      );
      void record.transport.capabilities.pictureInPicture?.setEnabled(false);
      await disconnectLivekitThenLeaveMatrixRTC(
        () => record.transport.disconnect(),
        record.session
      );
      record.keys.detach();
      record.ownerLease.release();
      if (activeRecord === record) activeRecord = undefined;
      if (clear && displayedRecord === record) {
        displayedRecord = undefined;
        setSession(undefined);
      }
      deps.onCleanup?.();
    })();
    await record.cleanupPromise;
  };

  const handleTransportState = (record: NativeCallRecord, state: CallTransportState): void => {
    if (!isCurrent(record)) return;
    if (state.connection === 'disconnected') {
      // A normal end clears the session; only a failure leaves an error the
      // user has to dismiss.
      void cleanup(record, state.error, state.error === undefined);
      return;
    }
    publish(record, state.connection, state);
  };

  const start = async (options: NativeCallStartOptions) => {
    const { mx, room, discovery, dm, video, microphone, ongoing } = options;
    const capabilities = options.capabilities ?? {
      supported: true,
      microphone: true,
      backgroundAudio: true,
      nativeRoom: true,
      camera: true,
      nativeVideoOverlay: true,
      screenShare: true,
      pictureInPicture: true,
      callKit: true,
      systemCalls: true,
      audioRoutes: true,
      pushKit: true,
    };
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
    let stage: SetupStage = 'joining-matrix';
    try {
      const callId = deps.createCallId();
      const session = mx.matrixRTC.getRoomSession(room);
      const keys = deps.createKeyPipeline();
      const transport = deps.createTransport(callId, dependencies);
      record = {
        roomId: room.roomId,
        callId,
        session,
        keys,
        transport,
        unsubscribeTransport: () => {},
        ownerLease,
        cancelled: false,
        handles: createCallSessionHandles(),
        capabilities,
      };
      const currentRecord = record;
      activeRecord = record;
      publish(record, 'starting');

      record.unsubscribeTransport = transport.subscribe((state) =>
        handleTransportState(currentRecord, state)
      );
      await transport.ready;

      const encryptMedia = callEncryptsMedia(room);
      if (encryptMedia) {
        // The transport queues anything that arrives before it is connected, so
        // a key is never dropped for being early.
        keys.setOnKey((key) => void transport.setEncryptionKey(key));
        keys.attach(session, { userId: mx.getSafeUserId(), deviceId: mx.getDeviceId() });
      }

      const joined = await joinCallSession(
        {
          mx,
          room,
          session,
          discovery,
          request: appFetch,
          subscribeToCallRoom: (roomId) => getSlidingSyncManager(mx)?.subscribeToCallRoom(roomId),
          getPreferredTransport: deps.getPreferredTransport,
          provisionToken: deps.provisionToken,
          callIntent: video ? 'video' : 'audio',
          dm,
          ongoing,
          encryptMedia,
          isCancelled: () => !isCurrent(currentRecord),
          onStage: (joinStage) => {
            stage = joinStage === 'joining-matrix' ? 'joining-matrix' : 'authorizing';
          },
        },
        currentRecord.handles
      );
      if (!isCurrent(currentRecord)) return;

      stage = 'connecting-livekit';
      if (encryptMedia) {
        await keys.waitForOwnKey();
        if (!isCurrent(currentRecord)) return;
      }

      await transport.connect({
        url: joined.provisioned.url,
        token: joined.provisioned.jwt,
        microphoneEnabled: microphone,
        cameraEnabled: video,
        encryptionKeys: keys.getKeys(),
      });

      // Report the outgoing system call so CallKit shows the active-call UI.
      // Use the pending uuid (from an answer action) if present; otherwise
      // generate a new uuid. The native side maps callId to uuid internally.
      const pendingSystemUuid = pendingSystemUuids.get(room.roomId);
      const systemUuid = pendingSystemUuid ?? crypto.randomUUID();
      const isIncomingAnswer = pendingSystemUuid !== undefined;
      pendingSystemUuids.delete(room.roomId);
      const callerName = room.name || room.roomId;
      void startSystemCall({ callId, uuid: systemUuid, callerName }).catch(
        ignoreNativeFailure('system-call start')
      );
      // Update the system call display with the room name and video flag so
      // CallKit shows the correct caller info.
      void deps
        .updateDisplay({
          callId,
          callerName,
          hasVideo: video,
        })
        .catch(ignoreNativeFailure('system-call display update'));
      // Report the call as connected to CallKit so the system UI updates.
      void reportSystemCallConnected(systemUuid).catch(
        ignoreNativeFailure('system-call connected report')
      );
      if (capabilities.pictureInPicture)
        void transport.capabilities.pictureInPicture?.setEnabled(true);
      // For system-initiated incoming answers: fulfill the deferred answer action.
      if (isIncomingAnswer) {
        void fulfillAnswerCall(systemUuid).catch(ignoreNativeFailure('answer-call fulfillment'));
      }
    } catch (cause) {
      const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
      debugLog.error(
        'call',
        `Native call setup failed during ${setupStageLabels[stage]}. ${detail}`
      );
      if (record) {
        await cleanup(record, setupErrorMessages[stage], false);
      } else {
        ownerLease.release();
        publishError(room.roomId, '', setupErrorMessages[stage], async () => {
          setSession(undefined);
        });
        deps.onCleanup?.();
      }
    }
  };

  const setMicrophoneEnabled = async (enabled: boolean): Promise<void> => {
    const record = activeRecord;
    if (!record || record.cancelled) return;
    await record.transport.setMicrophoneEnabled(enabled);
    // Push mute state back to CallKit for UI consistency.
    void setSystemCallMuted({ callId: record.callId, muted: !enabled }).catch(
      ignoreNativeFailure('system-call mute')
    );
  };

  const active = (): NativeCallTransport | undefined =>
    activeRecord && !activeRecord.cancelled ? activeRecord.transport : undefined;

  const setCameraEnabled = async (enabled: boolean): Promise<void> => {
    await active()?.setCameraEnabled(enabled);
  };

  const setScreenShareEnabled = async (enabled: boolean): Promise<void> => {
    await active()?.capabilities.screenShare?.setEnabled(enabled);
  };

  const switchCamera = async (): Promise<void> => {
    await active()?.capabilities.camera?.switch();
  };

  const listAudioRoutes = async (): Promise<NativeCallAudioRoute[]> =>
    (await active()?.capabilities.audioRoutes?.list()) ?? [];

  const selectAudioRoute = async (routeId: string): Promise<void> => {
    await active()?.capabilities.audioRoutes?.select(routeId);
  };

  return {
    start,
    setMicrophoneEnabled,
    setCameraEnabled,
    setScreenShareEnabled,
    switchCamera,
    listAudioRoutes,
    selectAudioRoute,
  };
};
