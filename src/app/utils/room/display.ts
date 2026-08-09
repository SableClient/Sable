import { EventTimeline, EventType, UNSTABLE_ELEMENT_FUNCTIONAL_USERS } from '$types/matrix-sdk';
import type { MatrixClient, Room, RoomMember, StateEvents } from '$types/matrix-sdk';

import { getMxIdLocalPart } from '$utils/matrix';
import { mxcUrlToHttp } from '../mediaUrl';
import { resolveDmOtherMember } from './directMember';

/**
 * The square-cropped avatar conversion every avatar call site repeats. Goes
 * through `mxcUrlToHttp` so the Tauri media rewrite is never bypassed.
 */
export const getAvatarUrl = (
  mx: MatrixClient,
  mxcUrl: string | null | undefined,
  size: number,
  useAuthentication = false
): string | undefined =>
  mxcUrl
    ? (mxcUrlToHttp(mx, mxcUrl, useAuthentication, size, size, 'crop') ?? undefined)
    : undefined;

export const getRoomAvatarUrl = (
  mx: MatrixClient,
  room: Room,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => getAvatarUrl(mx, room.getMxcAvatarUrl(), size, useAuthentication);

export const getDmOtherMember = (mx: MatrixClient, room: Room): RoomMember | undefined => {
  // A non-array service_members would otherwise make .includes a substring match.
  const serviceMembers = room
    .getLiveTimeline?.()
    ?.getState(EventTimeline.FORWARDS)
    ?.getStateEvents(UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name as keyof StateEvents, '')
    ?.getContent<{ service_members?: unknown }>().service_members;
  const functionalMembers = Array.isArray(serviceMembers)
    ? serviceMembers.filter((userId): userId is string => typeof userId === 'string')
    : [];
  const currentUserId = mx.getUserId();
  const mDirect = mx.getAccountData(EventType.Direct)?.getContent<Record<string, string[]>>();
  const directUserIds = Object.entries(mDirect ?? {})
    .filter(
      ([userId, roomIds]) =>
        userId !== currentUserId && Array.isArray(roomIds) && roomIds.includes(room.roomId)
    )
    .map(([userId]) => userId);

  const directMembers = directUserIds
    .map((userId) => room.getMember(userId))
    .filter((member): member is RoomMember => member != null);

  return resolveDmOtherMember({
    currentUserId,
    directMembers,
    members: room.getMembers(),
    functionalMemberIds: functionalMembers,
    fallbackMember: room.getAvatarFallbackMember(),
  });
};

export const getDirectRoomAvatarUrl = (
  mx: MatrixClient,
  room: Room,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = getDmOtherMember(mx, room)?.getMxcAvatarUrl();

  if (!mxcUrl) {
    return getRoomAvatarUrl(mx, room, size, useAuthentication);
  }

  return getAvatarUrl(mx, mxcUrl, size, useAuthentication);
};

export const trimReplyFromBody = (body: string): string => {
  const match = body.match(/^> <.+?> .+\n(>.*\n)*?\n/m);
  if (!match) return body;
  return body.slice(match[0].length);
};

export const trimReplyFromFormattedBody = (formattedBody: string): string => {
  const suffix = '</mx-reply>';
  const i = formattedBody.lastIndexOf(suffix);
  if (i < 0) {
    return formattedBody;
  }
  return formattedBody.slice(i + suffix.length);
};

export const getMemberDisplayName = (
  room: Room,
  userId: string,
  nicknames?: Record<string, string>
): string | undefined => {
  if (nicknames?.[userId]) return nicknames[userId];
  const member = room.getMember(userId);
  const name = member?.rawDisplayName;
  if (name === userId) return undefined;
  if (
    name?.replace(
      // oxlint-disable-next-line no-misleading-character-class -- Stripping invisible formatting characters from display names
      /[\p{Cc}\p{Cf}\u180B-\u180F\uFE00-\uFE0F\u200B-\u200D\t\n ]/gu,
      ''
    ).length === 0
  )
    return undefined;
  return name;
};

export const getTimelineSenderDisplayName = (
  room: Room,
  userId: string,
  nicknames?: Record<string, string>,
  profileDisplayName?: string
): string =>
  getMemberDisplayName(room, userId, nicknames) ??
  profileDisplayName ??
  getMxIdLocalPart(userId) ??
  userId;

export const getMemberSearchStr = (
  member: RoomMember,
  query: string,
  mxIdToName: (mxId: string) => string,
  nicknames?: Record<string, string>
): string[] => {
  const nickname = nicknames?.[member.userId];
  const displayName =
    member.rawDisplayName === member.userId ? mxIdToName(member.userId) : member.rawDisplayName;
  const idStr =
    query.startsWith('@') || query.indexOf(':') > -1 ? member.userId : mxIdToName(member.userId);

  const strings: string[] = [];
  if (nickname) strings.push(nickname);
  strings.push(displayName, idStr);
  return strings;
};

export const getMemberAvatarMxc = (room: Room, userId: string): string | undefined => {
  const member = room.getMember(userId);
  return member?.getMxcAvatarUrl();
};
