import type { AutoDiscoveryInfo } from '../../cs-api';
import {
  MatrixRTCSessionEvent,
  type CallMembership,
  type JoinSessionConfig,
  type MatrixClient,
  type MatrixRTCSession,
  type Room,
} from '$types/matrix-sdk';
import { getPreferredLivekitTransport, provisionLivekitToken } from './livekitProvisioning';
import type { LivekitProvisioningResult } from './livekitProvisioning';

const membershipWaitTimeoutMs = 10_000;

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
  deviceId: string
): MembershipWait => {
  let resolveWait!: () => void;
  let rejectWait!: (reason?: unknown) => void;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let membershipsListenerInstalled = false;
  let membershipErrorListenerInstalled = false;

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
  const membershipWait = waitForOwnMembership(session, identity.userId, identity.deviceId);
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
