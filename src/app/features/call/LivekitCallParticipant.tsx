import { useMemo } from 'react';
import { Avatar, Text, toRem } from 'folds';
import { userFallbackIcon } from '$components/icons/phosphor';
import { UserAvatar } from '$components/user-avatar';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoom } from '$hooks/useRoom';
import { getMemberAvatarMxc, getMemberDisplayName } from '$utils/room/display';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import type { UserIdByRtcIdentity } from './livekitCallIdentity';

export type CallParticipantProfile = {
  name: string;
  avatarUrl?: string;
  userId?: string;
};

export const useCallParticipantProfile = (
  identity: string,
  userIdByIdentity: UserIdByRtcIdentity,
  avatarSize = 96
): CallParticipantProfile => {
  const mx = useMatrixClient();
  const room = useRoom();
  const useAuthentication = useMediaAuthentication();

  return useMemo(() => {
    const userId = userIdByIdentity.get(identity);
    if (!userId) return { name: 'Unknown participant' };

    const avatarMxc = getMemberAvatarMxc(room, userId);
    return {
      userId,
      name: getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId,
      avatarUrl: avatarMxc
        ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, avatarSize, avatarSize) ?? undefined)
        : undefined,
    };
  }, [mx, room, useAuthentication, identity, userIdByIdentity, avatarSize]);
};

export function CallParticipantAvatar({
  profile,
  size,
}: {
  profile: CallParticipantProfile;
  size: string;
}) {
  return (
    <Avatar style={{ width: size, height: size }} radii="Pill">
      <UserAvatar
        userId={profile.userId ?? profile.name}
        src={profile.avatarUrl}
        alt={profile.name}
        renderFallback={() => userFallbackIcon('sm')}
      />
    </Avatar>
  );
}

export function CallParticipantName({ profile }: { profile: CallParticipantProfile }) {
  return (
    <Text size="T200" truncate style={{ maxWidth: toRem(180) }}>
      {profile.name}
    </Text>
  );
}
