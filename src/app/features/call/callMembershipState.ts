type RtcMembership = { userId?: string; sender?: string };

export type CallMembershipPresence = {
  hasSelfMember: boolean;
  remoteMemberCount: number;
};

export const getCallMembershipPresence = (
  mxUserId: string,
  memberships: RtcMembership[]
): CallMembershipPresence => {
  const remoteMemberCount = memberships.filter(
    (membership) => (membership.userId || membership.sender) !== mxUserId
  ).length;
  const hasSelfMember = memberships.some(
    (membership) => (membership.userId || membership.sender) === mxUserId
  );

  return { hasSelfMember, remoteMemberCount };
};

export const isIncomingCallActive = (mxUserId: string, memberships: RtcMembership[]): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(mxUserId, memberships);

  return remoteMemberCount > 0 && !hasSelfMember;
};

export const isCallActive = (mxUserId: string, memberships: RtcMembership[]): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(mxUserId, memberships);

  return hasSelfMember && remoteMemberCount > 0;
};

export const isOutgoingCallPending = (mxUserId: string, memberships: RtcMembership[]): boolean => {
  const { hasSelfMember, remoteMemberCount } = getCallMembershipPresence(mxUserId, memberships);

  return hasSelfMember && remoteMemberCount === 0;
};

export const getRemoteRtcMemberUserIds = (
  mxUserId: string,
  memberships: RtcMembership[]
): Set<string> => {
  return new Set(
    memberships
      .map((membership) => membership.userId || membership.sender)
      .filter((userId): userId is string => !!userId && userId !== mxUserId)
  );
};
