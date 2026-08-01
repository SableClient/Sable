import type { MatrixClient, Room } from '$types/matrix-sdk';
import {
  joinAndProvisionMatrixRTC,
  leaveMatrixRTCOnPageHide,
  type MatrixRTCJoinProvisionOptions,
  type MatrixRTCJoinProvisionResult,
} from './matrixRtcCallLifecycle';

/**
 * Everything a join installs that a teardown has to undo. The engines fill one
 * of these through `joinCallSession` and release them themselves: the web lane
 * drops the page-hide listener and the room subscription only after LiveKit has
 * disconnected, the native lane drops them up front, and that difference is
 * real rather than incidental.
 */
export type CallSessionHandles = {
  /** True once `joinRTCSession` was called, so a membership may need leaving. */
  joinStarted: boolean;
  cancelMembershipWait?: () => void;
  removePageHideListener?: () => void;
  unsubscribeCallRoom?: () => void;
};

export const createCallSessionHandles = (): CallSessionHandles => ({ joinStarted: false });

/**
 * The single gate on media encryption. MSC4143 makes MatrixRTC encryption
 * REQUIRED in an encrypted room and forbids it in an unencrypted one, where a
 * violating membership may be treated as left, so the room's own encryption
 * state decides `manageMediaKeys`, the key pipeline and the frame cryptor
 * together. Nothing else may be consulted.
 */
export const callEncryptsMedia = (room: Room): boolean => room.hasEncryptionStateEvent();

/**
 * Whether the room already has a call running. Joining one must not ring or
 * notify again: whoever started it already did.
 */
export const isCallOngoing = (mx: MatrixClient, room: Room): boolean =>
  mx.matrixRTC.getRoomSession(room).memberships.length > 0;

/**
 * The join, minus everything this module derives or wires up itself. The
 * derived fields are the ones that were being written twice.
 */
export type CallSessionJoinOptions = Omit<
  MatrixRTCJoinProvisionOptions,
  | 'notificationType'
  | 'manageMediaKeys'
  | 'onMembershipWait'
  | 'onCallRoomSubscribed'
  | 'onJoinStarted'
> & {
  /** A DM rings; a room only notifies. */
  dm: boolean;
  /** A call that is already running was announced by whoever started it. */
  ongoing: boolean;
  encryptMedia: boolean;
};

/**
 * Join MatrixRTC and provision an SFU token, recording what the join installed
 * in `handles`. Both engines run this identically; only what they do with the
 * resulting token differs.
 */
export const joinCallSession = (
  { dm, ongoing, encryptMedia, ...join }: CallSessionJoinOptions,
  handles: CallSessionHandles
): Promise<MatrixRTCJoinProvisionResult> =>
  joinAndProvisionMatrixRTC({
    ...join,
    ...(ongoing ? {} : { notificationType: dm ? 'ring' : 'notification' }),
    manageMediaKeys: encryptMedia,
    onMembershipWait: (cancel) => {
      handles.cancelMembershipWait = cancel;
    },
    onCallRoomSubscribed: (unsubscribe) => {
      handles.unsubscribeCallRoom = unsubscribe;
    },
    onJoinStarted: () => {
      handles.joinStarted = true;
      handles.removePageHideListener = leaveMatrixRTCOnPageHide(join.session);
    },
  });
