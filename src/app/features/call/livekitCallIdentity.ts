import type { CallMembership } from '$types/matrix-sdk';

/** Maps a LiveKit participant identity to the Matrix user behind it. */
export type UserIdByRtcIdentity = ReadonlyMap<string, string>;

// `rtcBackendIdentity` is an anonymised SHA-256 of the user/device/member
// triple, so the session memberships are the only place both halves are known.
export const buildRtcIdentityMap = (members: CallMembership[]): UserIdByRtcIdentity => {
  const identities = new Map<string, string>();
  members.forEach((member) => {
    const { userId } = member;
    if (userId) identities.set(member.rtcBackendIdentity, userId);
  });
  return identities;
};
