import type { CallMembership } from '$types/matrix-sdk';

/** Maps a LiveKit participant identity to the Matrix user behind it. */
export type UserIdByRtcIdentity = ReadonlyMap<string, string>;

/**
 * Our own user and device, used to recognise our key among the ones
 * `EncryptionKeyChanged` reports. The LiveKit identity itself cannot be derived
 * locally: it depends on the membership format the SFU was told to expect, so
 * it is only ever read off the event.
 */
export type LocalCallIdentity = { userId: string; deviceId: string | null };

// The SFU decides what a LiveKit participant identity looks like: the
// anonymised SHA-256 for sticky-event RTC memberships, or `user:device` on the
// legacy path. Index every candidate so either shape resolves.
export const buildRtcIdentityMap = (members: CallMembership[]): UserIdByRtcIdentity => {
  const identities = new Map<string, string>();
  members.forEach((member) => {
    const { userId, deviceId } = member;
    if (!userId) return;
    [member.rtcBackendIdentity, member.memberId, deviceId && `${userId}:${deviceId}`].forEach(
      (candidate) => {
        if (candidate) identities.set(candidate, userId);
      }
    );
  });
  return identities;
};
