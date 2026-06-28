import { describe, expect, it } from 'vitest';
import type { IncomingCall } from '$state/callEmbed';
import {
  evaluateIncomingCallFallback,
  evaluateOutgoingRingbackFallback,
  type OutgoingRingbackState,
} from './callSignalingFallback';
import type { SessionDescription } from './callMembershipState';
import { INCOMING_MEMBERSHIP_GRACE_MS, OUTGOING_RING_TIMEOUT_MS } from './callSignalingPolicy';

const NOW = 1_700_000_000_000;
const EMPTY_SESSION = {} as SessionDescription;

const incomingCall: IncomingCall = {
  roomId: '!room:example.org',
  notificationEventId: '$notif',
  refEventId: '$ref',
  senderId: '@caller:example.org',
  senderTs: NOW - 1_000,
  expiresAt: NOW + 60_000,
  notificationType: 'ring',
  intentKind: 'audio',
  isDirect: true,
};

describe('evaluateIncomingCallFallback', () => {
  it('clears expired incoming calls', () => {
    expect(
      evaluateIncomingCallFallback({ ...incomingCall, expiresAt: NOW - 1 }, NOW, {
        myUserId: '@self:example.org',
        getRoom: () => null,
        getSessionDescription: () => EMPTY_SESSION,
      })
    ).toEqual({ kind: 'clear', reason: 'expired' });
  });

  it('keeps incoming call during membership grace window', () => {
    expect(
      evaluateIncomingCallFallback(incomingCall, NOW, {
        myUserId: '@self:example.org',
        getRoom: () => ({ roomId: incomingCall.roomId }) as never,
        getSessionDescription: () => EMPTY_SESSION,
        isIncomingActive: () => false,
      })
    ).toEqual({ kind: 'none' });
  });

  it('clears incoming call after grace when membership is inactive', () => {
    const action = evaluateIncomingCallFallback(
      { ...incomingCall, senderTs: NOW - INCOMING_MEMBERSHIP_GRACE_MS - 1 },
      NOW,
      {
        myUserId: '@self:example.org',
        getRoom: () => ({ roomId: incomingCall.roomId }) as never,
        getSessionDescription: () => EMPTY_SESSION,
        isIncomingActive: () => false,
      }
    );
    expect(action).toEqual({ kind: 'clear', reason: 'membership_dropped' });
  });
});

describe('evaluateOutgoingRingbackFallback', () => {
  const baseContext = {
    myUserId: '@self:example.org',
    activeCallRoomId: '!room:example.org',
    outgoingRingbackAllowed: true,
    declinedRoomId: null,
    hasCallBeenActive: false,
    getRoom: () => ({ roomId: '!room:example.org' }) as never,
    getSessionDescription: () => EMPTY_SESSION,
  };

  it('stops ringback when outgoing call is no longer pending', () => {
    const state: OutgoingRingbackState = {
      ringRoomId: '!room:example.org',
      ringStartedAt: NOW,
    };
    const action = evaluateOutgoingRingbackFallback(state, NOW, {
      ...baseContext,
      getRoom: () => undefined,
    });
    expect(action.kind).toBe('stop');
    expect(action.nextState).toEqual({ ringRoomId: null, ringStartedAt: null });
  });

  it('plays ringback for pending outgoing calls and tracks start time', () => {
    const action = evaluateOutgoingRingbackFallback(
      { ringRoomId: null, ringStartedAt: null },
      NOW,
      {
        ...baseContext,
        isOutgoingPending: () => true,
        isCallActive: () => false,
      }
    );
    expect(action).toMatchObject({
      kind: 'play',
      roomId: '!room:example.org',
      started: true,
    });
  });

  it('stops ringback after timeout', () => {
    const action = evaluateOutgoingRingbackFallback(
      {
        ringRoomId: '!room:example.org',
        ringStartedAt: NOW - OUTGOING_RING_TIMEOUT_MS,
      },
      NOW,
      {
        ...baseContext,
        isOutgoingPending: () => true,
        isCallActive: () => false,
      }
    );
    expect(action.kind).toBe('stop');
  });

  it('stops ringback if call has been active previously', () => {
    const action = evaluateOutgoingRingbackFallback(
      { ringRoomId: null, ringStartedAt: null },
      NOW,
      {
        ...baseContext,
        hasCallBeenActive: true,
        isOutgoingPending: () => true,
        isCallActive: () => false,
      }
    );
    expect(action.kind).toBe('stop');
  });
});
