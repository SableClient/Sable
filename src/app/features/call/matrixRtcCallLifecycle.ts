import type { AutoDiscoveryInfo } from '../../cs-api';
import {
  EventType,
  MatrixRTCSessionEvent,
  type CallMembership,
  type JoinSessionConfig,
  type MatrixClient,
  type MatrixRTCSession,
  type Room,
} from '$types/matrix-sdk';
import { getPreferredLivekitTransport, provisionLivekitToken } from './livekitProvisioning';
import type { LivekitProvisioningResult } from './livekitProvisioning';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('matrixRtcCallLifecycle');

const membershipWaitTimeoutMs = 30_000;
const fallbackPollIntervalMs = 1_000;
const callMemberEventType = EventType.RTCMembership;
const legacyCallMemberEventType = EventType.GroupCallMemberPrefix;

export type MatrixRTCJoinProvisionOptions = {
  mx: MatrixClient;
  room: Room;
  session: MatrixRTCSession;
  discovery?: Pick<AutoDiscoveryInfo, 'org.matrix.msc4143.rtc_foci'>;
  getPreferredTransport?: typeof getPreferredLivekitTransport;
  provisionToken?: typeof provisionLivekitToken;
  callIntent: JoinSessionConfig['callIntent'];
  notificationType?: JoinSessionConfig['notificationType'];
  manageMediaKeys?: boolean;
  isCancelled?: () => boolean;
  onStage?: (stage: 'joining-matrix' | 'provisioning') => void;
  onMembershipWait?: (cancel: (() => void) | undefined) => void;
  onJoinStarted?: () => void;
};

export type MatrixRTCJoinProvisionResult = {
  ownMembership: CallMembership | undefined;
  provisioned: LivekitProvisioningResult;
};

type MembershipWait = {
  promise: Promise<void>;
  cancel: () => void;
};

const waitForOwnMembership = (
  session: MatrixRTCSession,
  userId: string,
  deviceId: string,
  mx: MatrixClient,
  roomId: string
): MembershipWait => {
  let resolveWait!: () => void;
  let rejectWait!: (reason?: unknown) => void;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setInterval> | undefined;
  let membershipsListenerInstalled = false;
  let membershipErrorListenerInstalled = false;

  const stateKey = `_${userId}_${deviceId}_m.call`;

  const handleMembershipsChanged = (
    _oldMemberships: CallMembership[],
    memberships: CallMembership[]
  ): void => {
    debugLog.info(
      'call',
      `membership changed: n=${memberships.length} want=${userId}:${deviceId} have=${memberships.map((m) => `${m.userId}:${m.deviceId}`).join(',')}`
    );

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

  const stopFallback = (): void => {
    if (fallbackTimer !== undefined) {
      clearInterval(fallbackTimer);
      fallbackTimer = undefined;
    }
  };

  const settle = (settlePromise: () => void): void => {
    if (settled) return;
    settled = true;
    if (timeout !== undefined) clearTimeout(timeout);
    stopFallback();
    removeListeners();
    settlePromise();
  };

  const promise = new Promise<void>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });
  // joinRTCSession can throw before the promise is awaited; keep the cancel
  // rejection from surfacing as an unhandled rejection in that window.
  promise.catch(() => {});

  try {
    session.on(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChanged);
    membershipsListenerInstalled = true;
    session.on(MatrixRTCSessionEvent.MembershipManagerError, handleMembershipManagerError);
    membershipErrorListenerInstalled = true;
    timeout = setTimeout(
      () => settle(() => rejectWait(new Error('MatrixRTC membership publication timed out'))),
      membershipWaitTimeoutMs
    );

    // Server-side fallback: poll mx.getStateEvent so we detect the membership
    // even when the local session filters it out during sync gaps.
    fallbackTimer = setInterval(() => {
      if (settled) return;
      debugLog.info(
        'call',
        `fallback poll: checking server-side membership ${stateKey} in ${roomId}`
      );
      mx.getStateEvent(roomId, callMemberEventType, stateKey)
        .then((event) => {
          if (event && !settled) {
            debugLog.info('call', `fallback resolved: found server-side membership ${stateKey}`);
            settle(resolveWait);
          }
        })
        .catch(() =>
          // Try the legacy event type as fallback
          mx.getStateEvent(roomId, legacyCallMemberEventType, stateKey)
            .then((event) => {
              if (event && !settled) {
                debugLog.info('call', `fallback resolved (legacy): found server-side membership ${stateKey}`);
                settle(resolveWait);
              }
            })
            .catch(() => {
              // next poll will retry
            })
        );
    }, fallbackPollIntervalMs);
  } catch {
    settle(() => rejectWait(new Error('MatrixRTC membership listener setup failed')));
  }

  return {
    promise,
    cancel: () => settle(() => rejectWait(new Error('MatrixRTC membership wait cancelled'))),
  };
};

export const joinAndProvisionMatrixRTC = async ({
  mx,
  room,
  session,
  discovery,
  getPreferredTransport = getPreferredLivekitTransport,
  provisionToken = provisionLivekitToken,
  callIntent,
  notificationType,
  manageMediaKeys = false,
  isCancelled,
  onStage,
  onMembershipWait,
  onJoinStarted,
}: MatrixRTCJoinProvisionOptions): Promise<MatrixRTCJoinProvisionResult> => {
  const deviceId = mx.getDeviceId();
  if (!deviceId) throw new Error('MatrixRTC device unavailable');

  const transport = await getPreferredTransport(mx, discovery);
  if (!transport) throw new Error('No LiveKit transport available');

  const userId = mx.getSafeUserId();
  const identity = { userId, deviceId, memberId: `${userId}:${deviceId}` };
  if (isCancelled?.()) throw new Error('MatrixRTC setup cancelled');
  const membershipWait = waitForOwnMembership(session, identity.userId, identity.deviceId, mx, room.roomId);
  onMembershipWait?.(membershipWait.cancel);
  onStage?.('joining-matrix');

  try {
    const joinConfig: JoinSessionConfig = {
      callIntent,
      ...(notificationType ? { notificationType } : {}),
      ...(manageMediaKeys ? { manageMediaKeys: true } : {}),
    };
    onJoinStarted?.();
    session.joinRTCSession(identity, [transport], undefined, joinConfig);
    await membershipWait.promise;
  } catch (error) {
    membershipWait.cancel();
    throw error;
  } finally {
    onMembershipWait?.(undefined);
  }

  if (isCancelled?.()) throw new Error('MatrixRTC setup cancelled');
  const slotId = session.slotId;
  if (!slotId) throw new Error('MatrixRTC slot was not assigned');
  const ownMembership = session.memberships?.find(
    (membership) =>
      membership.userId === identity.userId && membership.deviceId === identity.deviceId
  );

  onStage?.('provisioning');
  const provisioned = await provisionToken({
    mx,
    roomId: room.roomId,
    slotId,
    deviceId,
    serviceUrl: transport.livekit_service_url,
    memberId: identity.memberId,
    userId: identity.userId,
  });
  if (isCancelled?.()) throw new Error('MatrixRTC setup cancelled');

  return { ownMembership, provisioned };
};

export const disconnectLivekitThenLeaveMatrixRTC = async (
  disconnect: () => Promise<void>,
  session: MatrixRTCSession
): Promise<void> => {
  try {
    await disconnect();
  } catch {}
  try {
    await session.leaveRoomSession(5000);
  } catch {}
};
