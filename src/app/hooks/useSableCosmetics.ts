import { useMemo } from 'react';
import { type Room } from '$types/matrix-sdk';
import { usePowerLevels } from './usePowerLevels';
import { useRoomCreators } from './useRoomCreators';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from './useMemberPowerTag';
import { useRoomCreatorsTag } from './useRoomCreatorsTag';
import { usePowerLevelTags } from './usePowerLevelTags';
import { useTheme } from './useTheme';
import { useUserProfile } from './useUserProfile';

export function useSableCosmetics(userId: string, room: Room) {
  const theme = useTheme();
  const profile = useUserProfile(userId, room);

  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const creatorsTag = useRoomCreatorsTag();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);
  const getPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

  const accessibleTagColors = useAccessiblePowerTagColors(theme.kind, creatorsTag, powerLevelTags);

  return useMemo(() => {
    if (!room || !userId) return { color: undefined, font: undefined };

    let finalColor = profile.resolvedColor;
    if (!finalColor) {
      const memberPowerTag = getPowerTag(userId);
      finalColor = memberPowerTag?.color
        ? accessibleTagColors?.get(memberPowerTag.color)
        : undefined;
    }

    return {
      color: finalColor,
      font: profile.resolvedFont,
    };
  }, [room, userId, profile.resolvedColor, profile.resolvedFont, getPowerTag, accessibleTagColors]);
}
