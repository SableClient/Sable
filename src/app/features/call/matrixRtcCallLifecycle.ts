import type { AutoDiscoveryInfo } from '../../cs-api';
import {
  KnownMembership,
  MatrixRTCSessionEvent,
  type CallMembership,
  type JoinSessionConfig,
  type MatrixClient,
  type MatrixRTCSession,
  type Room,
} from '$types/matrix-sdk';
import {
  getPreferredLivekitTransport,
  isLivekitTransportConfig,
  provisionLivekitToken,
} from './livekitProvisioning';
import { advertiseCallTransport, callMemberId } from './callProtocol';
import type { LivekitProvisioningResult } from './livekitProvisioning';
import { getSlidingSyncManager } from '$client/initMatrix';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('matrixRtcCallLifecycle');

// Without delayed events nothing on the server retracts our membership when the
// app dies, so the expiry is what bounds a ghost participant. The SDK refreshes
// the event 5s before it lapses, so half an hour is far more headroom than a
// live call needs while cutting the stale window down from the 4h default.
const membershipEventExpiryMs = 30 * 60 * 1000;

const membershipWaitTimeoutMs = 30_000;

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
  onCallRoomSubscribed?: (unsubscribe: () => void) => void;
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

export const ROSTER_HYDRATION_ERROR = 'MatrixRTC roster hydration failed';

const loadRoster = async (room: Room): Promise<boolean> => {
  try {
    return await room.loadMembersIfNeeded();
  } catch (error) {
    debugLog.error('call', `roster hydration threw for ${room.roomId}`, error);
    throw new Error(ROSTER_HYDRATION_ERROR, { cause: error });
  }
};

const rosterComplete = (room: Room): boolean =>
  room.membersLoaded() &&
  room.getMembersWithMembership(KnownMembership.Join).length >= room.getJoinedMemberCount();

const rosterState = (room: Room, fromServer: boolean): string =>
  `joined=${room.getMembersWithMembership(KnownMembership.Join).length}/${room.getJoinedMemberCount()} loaded=${room.membersLoaded()} fromServer=${fromServer}`;

/**
 * The SDK needs the full roster before we publish a membership: without it
 * `isValidMembership` discards the other participants, which breaks key
 * exchange both ways at once.
 */
const hydrateCallRoster = async (room: Room): Promise<void> => {
  let fromServer = await loadRoster(room);

  // `loadMembers` only asks the server when the out-of-band store is empty or
  // the room is encrypted, so an unencrypted room can be answered from a stale
  // cache. Clearing it forces the next load to fetch.
  if (!rosterComplete(room) && !fromServer) {
    debugLog.warn('call', `roster stale for ${room.roomId}, refetching: ${rosterState(room, false)}`);
    try {
      await room.clearLoadedMembersIfNeeded();
    } catch (error) {
      debugLog.error('call', `clearing the cached roster failed for ${room.roomId}`, error);
      throw new Error(ROSTER_HYDRATION_ERROR, { cause: error });
    }
    fromServer = await loadRoster(room);
  }

  if (!rosterComplete(room)) {
    debugLog.error('call', `roster incomplete for ${room.roomId}: ${rosterState(room, fromServer)}`);
    throw new Error(ROSTER_HYDRATION_ERROR);
  }
  debugLog.info('call', `roster hydrated for ${room.roomId}: ${rosterState(room, fromServer)}`);
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
  onCallRoomSubscribed,
  onJoinStarted,
}: MatrixRTCJoinProvisionOptions): Promise<MatrixRTCJoinProvisionResult> => {
  const deviceId = mx.getDeviceId();
  if (!deviceId) throw new Error('MatrixRTC device unavailable');

  const preferredTransport = await getPreferredTransport(mx, discovery);
  if (!preferredTransport) {
    debugLog.error('call', `no LiveKit transport advertised for ${room.roomId}`);
    throw new Error('No LiveKit transport available');
  }

  const advertisedTransport = advertiseCallTransport(preferredTransport, room.roomId);

  const userId = mx.getSafeUserId();
  const identity = { userId, deviceId, memberId: callMemberId(userId, deviceId) };
  if (isCancelled?.()) throw new Error('MatrixRTC setup cancelled');

  // The subscription keeps the roster fresh for the rest of the call, but it
  // cannot be waited on: MSC4186 only returns a room when it has new data or
  // has never been sent, and Synapse does not return expanded state until the
  // room next changes. So fetch the roster outright rather than hoping sync
  // volunteers it. `lazyLoadMembers` makes this necessary on both sync paths.
  const callRoomSubscription = getSlidingSyncManager(mx)?.subscribeToCallRoom(room.roomId);
  if (callRoomSubscription) onCallRoomSubscribed?.(callRoomSubscription);
  await hydrateCallRoster(room);
  if (isCancelled?.()) throw new Error('MatrixRTC setup cancelled');

  const membershipWait = waitForOwnMembership(session, identity.userId, identity.deviceId);
  onMembershipWait?.(membershipWait.cancel);
  onStage?.('joining-matrix');

  try {
    const joinConfig: JoinSessionConfig = {
      callIntent,
      membershipEventExpiryMs,
      ...(notificationType ? { notificationType } : {}),
      ...(manageMediaKeys ? { manageMediaKeys: true } : {}),
    };
    onJoinStarted?.();
    session.joinRTCSession(identity, [advertisedTransport], undefined, joinConfig);
    await membershipWait.promise;
    debugLog.info(
      'call',
      `own membership published in ${room.roomId} as ${identity.userId}:${identity.deviceId}`
    );
  } catch (error) {
    membershipWait.cancel();
    debugLog.error('call', `own membership was not published in ${room.roomId}`, error);
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

  // Use the oldest membership's transport so every participant uses the same SFU.
  const oldestMembership = session.getOldestMembership();
  const oldestTransport = oldestMembership?.getTransport(oldestMembership);
  const fromOldestMembership = !!oldestTransport && isLivekitTransportConfig(oldestTransport);
  const callTransport = fromOldestMembership ? oldestTransport : preferredTransport;

  debugLog.info(
    'call',
    `sfu selected for ${room.roomId}: source=${fromOldestMembership ? 'oldest-membership' : 'preferred'} url=${callTransport.livekit_service_url} slot=${slotId}`
  );
  onStage?.('provisioning');
  const provisioned = await provisionToken({
    mx,
    roomId: room.roomId,
    deviceId,
    serviceUrl: callTransport.livekit_service_url,
  });
  if (isCancelled?.()) throw new Error('MatrixRTC setup cancelled');

  return { ownMembership, provisioned };
};

export const leaveMatrixRTCOnPageHide = (session: MatrixRTCSession): (() => void) => {
  const handlePageHide = (event: PageTransitionEvent): void => {
    // A persisted page is only frozen (mobile app switch, back/forward cache)
    // and the call is still ours when it resumes; only a real teardown leaves.
    if (event.persisted) return;
    void session.leaveRoomSession().catch(() => undefined);
  };
  window.addEventListener('pagehide', handlePageHide);
  return () => window.removeEventListener('pagehide', handlePageHide);
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
