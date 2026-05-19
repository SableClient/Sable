import { MatrixRTCSession } from '$types/matrix-sdk';
import type { Room } from '$types/matrix-sdk';

export type SessionDescription = Parameters<typeof MatrixRTCSession.sessionMembershipsForRoom>[1];

type RtcMembership = { userId?: string; sender?: string };

export type CallMembershipPresence = {
  hasSelfMember: boolean;
  remoteMemberCount: number;
};

const getRoomMemberships = (room: Room, sessionDescription: SessionDescription) =>
  MatrixRTCSession.sessionMembershipsForRoom(room, sessionDescription) as RtcMembership[];

export const getCallMembershipPresence = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): CallMembershipPresence => {
  const memberships = getRoomMemberships(room, sessionDescription);
  const remoteMemberCount = memberships.filter(
    (membership) => (membership.userId || membership.sender) !== mxUserId
  ).length;
  const hasSelfMember = memberships.some(
    (membership) => (membership.userId || membership.sender) === mxUserId
  );

  return { hasSelfMember, remoteMemberCount };
};

export const isIncomingCallActive = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(
    mxUserId,
    room,
    sessionDescription
  );

  return remoteMemberCount > 0 && !hasSelfMember;
};

export const isCallActive = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(
    mxUserId,
    room,
    sessionDescription
  );

  return hasSelfMember && remoteMemberCount > 0;
};

export const isOutgoingCallPending = (
  mxUserId: string,
  room: Room,
  sessionDescription: SessionDescription
): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(
    mxUserId,
    room,
    sessionDescription
  );

  return hasSelfMember && remoteMemberCount === 0;
};
