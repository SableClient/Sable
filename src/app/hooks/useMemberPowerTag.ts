import { useCallback, useMemo } from 'react';
import type { MatrixClient, Room, RoomMember } from '$types/matrix-sdk';
import type { MemberPowerTag, MemberPowerTagIcon } from '$types/matrix/room';
import { useAccessibleNameColor } from './useAccessibleNameColor';
import { mxcUrlToHttp } from '$utils/matrix';
import type { PowerLevelTags } from './usePowerLevelTags';
import { getPowerLevelTag, usePowerLevelTags } from './usePowerLevelTags';
import type { IPowerLevels } from './usePowerLevels';
import { readPowerLevel } from './usePowerLevels';
import { useRoomCreatorsTag } from './useRoomCreatorsTag';
import type { ThemeKind } from './useTheme';

export type GetMemberPowerTag = (userId: string) => MemberPowerTag;

export const useGetMemberPowerTag = (
  room: Room,
  creators: Set<string>,
  powerLevels: IPowerLevels
) => {
  const creatorsTag = useRoomCreatorsTag();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);

  const getMemberPowerTag: GetMemberPowerTag = useCallback(
    (userId) => {
      if (creators.has(userId)) {
        return creatorsTag;
      }

      const power = readPowerLevel.user(powerLevels, userId);
      return getPowerLevelTag(powerLevelTags, power);
    },
    [creators, creatorsTag, powerLevels, powerLevelTags]
  );

  return getMemberPowerTag;
};

export const getPowerTagIconSrc = (
  mx: MatrixClient,
  useAuthentication: boolean,
  icon: MemberPowerTagIcon
): string | undefined =>
  icon?.key?.startsWith('mxc://')
    ? (mxcUrlToHttp(mx, icon.key, useAuthentication, 96, 96, 'scale') ?? '🌻')
    : icon?.key;

export const useAccessiblePowerTagColors = (
  themeKind: ThemeKind,
  creatorsTag: MemberPowerTag,
  powerLevelTags: PowerLevelTags
): Map<string, string> => {
  const accessibleNameColor = useAccessibleNameColor(themeKind);

  const accessibleColors: Map<string, string> = useMemo(() => {
    const colors: Map<string, string> = new Map();
    if (creatorsTag.color) {
      colors.set(creatorsTag.color, accessibleNameColor(creatorsTag.color) ?? creatorsTag.color);
    }

    Object.values(powerLevelTags).forEach((tag) => {
      const { color } = tag;
      if (!color) return;

      colors.set(color, accessibleNameColor(color) ?? color);
    });

    return colors;
  }, [powerLevelTags, creatorsTag, accessibleNameColor]);

  return accessibleColors;
};

export const useFlattenPowerTagMembers = (
  members: RoomMember[],
  getTag: GetMemberPowerTag
): Array<MemberPowerTag | RoomMember> => {
  const PLTagOrRoomMember = useMemo(() => {
    let prevTag: MemberPowerTag | undefined;
    const tagOrMember: Array<MemberPowerTag | RoomMember> = [];
    members.forEach((member) => {
      const tag = getTag(member.userId);
      if (tag !== prevTag) {
        prevTag = tag;
        tagOrMember.push(tag);
      }
      tagOrMember.push(member);
    });
    return tagOrMember;
  }, [members, getTag]);

  return PLTagOrRoomMember;
};
