import { useCallback, useMemo } from 'react';
import { type MatrixClient, type Room, type RoomMember } from '$types/matrix-sdk';
import { type MemberPowerTag, type MemberPowerTagIcon } from '$types/matrix/room';
import { accessibleColor } from '$plugins/color';
import { getPowerLevelTag, type PowerLevelTags, usePowerLevelTags } from './usePowerLevelTags';
import { type IPowerLevels, readPowerLevel } from './usePowerLevels';
import { useRoomCreatorsTag } from './useRoomCreatorsTag';
import { type ThemeKind } from './useTheme';

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
    ? (mx.mxcUrlToHttp(icon.key, 96, 96, 'scale', undefined, undefined, useAuthentication) ?? '🌻')
    : icon?.key;

export const useAccessiblePowerTagColors = (
  themeKind: ThemeKind,
  creatorsTag: MemberPowerTag,
  powerLevelTags: PowerLevelTags
): Map<string, string> => {
  const accessibleColors: Map<string, string> = useMemo(() => {
    const colors: Map<string, string> = new Map();
    if (creatorsTag.color) {
      colors.set(creatorsTag.color, accessibleColor(themeKind, creatorsTag.color));
    }

    Object.values(powerLevelTags).forEach((tag) => {
      const { color } = tag;
      if (!color) return;

      colors.set(color, accessibleColor(themeKind, color));
    });

    return colors;
  }, [powerLevelTags, creatorsTag, themeKind]);

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
