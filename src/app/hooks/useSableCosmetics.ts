import { useMemo } from 'react';
import type { IContent } from '$types/matrix-sdk';
import type { Room } from '$types/matrix-sdk';
import { usePowerLevels } from './usePowerLevels';
import { useRoomCreators } from './useRoomCreators';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from './useMemberPowerTag';
import { useRoomCreatorsTag } from './useRoomCreatorsTag';
import { usePowerLevelTags } from './usePowerLevelTags';
import { useTheme } from './useTheme';
import { useUserProfile } from './useUserProfile';
import { useAccessibleNameColor } from './useAccessibleNameColor';

export function useSableCosmetics(
  userId: string,
  room: Room,
  isUserHero?: boolean,
  fetchProfile = true
) {
  const theme = useTheme();
  const profile = useUserProfile(userId, room, undefined, false, fetchProfile);

  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const creatorsTag = useRoomCreatorsTag();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);
  const getPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

  const accessibleTagColors = useAccessiblePowerTagColors(theme.kind, creatorsTag, powerLevelTags);
  const accessibleNameColor = useAccessibleNameColor(theme.kind);

  return useMemo(() => {
    if (!room || !userId) return { color: undefined, font: undefined };

    let finalColor = accessibleNameColor(
      isUserHero ? profile.heroNameColor : profile.resolvedColor
    );
    if (!finalColor) {
      const memberPowerTag = getPowerTag(userId);
      finalColor = memberPowerTag?.color
        ? accessibleTagColors?.get(memberPowerTag.color)
        : undefined;
    }
    const resolvedCosmetics: IContent = {
      color: finalColor,
      font: profile.resolvedFont,
    };

    return resolvedCosmetics;
  }, [
    room,
    userId,
    isUserHero,
    profile.heroNameColor,
    profile.resolvedColor,
    profile.resolvedFont,
    getPowerTag,
    accessibleTagColors,
    accessibleNameColor,
  ]);
}
