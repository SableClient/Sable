import { describe, expect, it } from 'vitest';
import type { IncomingCall } from '$state/callEmbed';
import { evaluateIncomingCallFallback } from './callSignalingFallback';
import type { SessionDescription } from './callMembershipState';
import { INCOMING_MEMBERSHIP_GRACE_MS } from './callSignalingPolicy';

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
