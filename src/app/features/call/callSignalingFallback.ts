import type { IncomingCall } from '$state/callEmbed';
import type { Room } from '$types/matrix-sdk';
import {
  isCallActive,
  isIncomingCallActive,
  isOutgoingCallPending,
  type SessionDescription,
} from './callMembershipState';
import { INCOMING_MEMBERSHIP_GRACE_MS, OUTGOING_RING_TIMEOUT_MS } from './callSignalingPolicy';

export type IncomingFallbackAction =
  | { kind: 'none' }
  | { kind: 'clear'; reason: 'expired' | 'missing_room' | 'membership_dropped' };

export type IncomingFallbackContext = {
  myUserId: string;
  getRoom: (roomId: string) => Room | null | undefined;
  getSessionDescription: (room: Room) => SessionDescription;
  isIncomingActive?: typeof isIncomingCallActive;
};

export const evaluateIncomingCallFallback = (
  incoming: IncomingCall | null,
  now: number,
  context: IncomingFallbackContext
): IncomingFallbackAction => {
  if (!incoming) return { kind: 'none' };
  if (now >= incoming.expiresAt) return { kind: 'clear', reason: 'expired' };

  const incomingRoom = context.getRoom(incoming.roomId);
  if (!incomingRoom) return { kind: 'clear', reason: 'missing_room' };

  const sessionDescription = context.getSessionDescription(incomingRoom);
  const isIncomingActive = context.isIncomingActive ?? isIncomingCallActive;
  if (isIncomingActive(context.myUserId, incomingRoom, sessionDescription)) {
    return { kind: 'none' };
  }

  // Session membership can lag behind live RTC notification delivery.
  if (now - incoming.senderTs < INCOMING_MEMBERSHIP_GRACE_MS) {
    return { kind: 'none' };
  }

  return { kind: 'clear', reason: 'membership_dropped' };
};

export type OutgoingRingbackState = {
  ringRoomId: string | null;
  ringStartedAt: number | null;
};

export type OutgoingRingbackAction =
  | { kind: 'stop'; nextState: OutgoingRingbackState }
  | { kind: 'play'; roomId: string; nextState: OutgoingRingbackState; started: boolean };

export type OutgoingRingbackContext = {
  myUserId: string;
  activeCallRoomId: string | undefined;
  outgoingRingbackAllowed: boolean;
  declinedRoomId: string | null;
  hasCallBeenActive: boolean;
  getRoom: (roomId: string) => Room | null | undefined;
  getSessionDescription: (room: Room) => SessionDescription;
  isOutgoingPending?: typeof isOutgoingCallPending;
  isCallActive?: typeof isCallActive;
};

const clearedRingbackState = (): OutgoingRingbackState => ({
  ringRoomId: null,
  ringStartedAt: null,
});

export const evaluateOutgoingRingbackFallback = (
  state: OutgoingRingbackState,
  now: number,
  context: OutgoingRingbackContext
): OutgoingRingbackAction => {
  const stop = (): OutgoingRingbackAction => ({
    kind: 'stop',
    nextState: clearedRingbackState(),
  });

  if (!context.activeCallRoomId || !context.outgoingRingbackAllowed) {
    return stop();
  }
  if (context.declinedRoomId === context.activeCallRoomId) {
    return stop();
  }

  const outgoingRoom = context.getRoom(context.activeCallRoomId);
  if (!outgoingRoom) {
    return stop();
  }

  const sessionDescription = context.getSessionDescription(outgoingRoom);
  const isOutgoingPending = context.isOutgoingPending ?? isOutgoingCallPending;
  const isActive = context.isCallActive ?? isCallActive;
  const pendingOutgoing = isOutgoingPending(context.myUserId, outgoingRoom, sessionDescription);
  const activeCall = isActive(context.myUserId, outgoingRoom, sessionDescription);

  if (!pendingOutgoing || activeCall || context.hasCallBeenActive) {
    return stop();
  }

  const started = state.ringRoomId !== context.activeCallRoomId;
  const nextState: OutgoingRingbackState = started
    ? { ringRoomId: context.activeCallRoomId, ringStartedAt: now }
    : state;

  if (nextState.ringStartedAt && now - nextState.ringStartedAt >= OUTGOING_RING_TIMEOUT_MS) {
    return stop();
  }

  return {
    kind: 'play',
    roomId: context.activeCallRoomId,
    nextState,
    started,
  };
};
