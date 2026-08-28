import type { Room } from '$types/matrix-sdk';
import type { Nicknames } from '$state/nicknames';
import { getMxIdLocalPart, isUserId } from '$utils/matrix';
import { getMemberDisplayName } from '$utils/room/display';
import { BlockType } from './types';
import type { CommandToken, EditorText, EmoticonToken, LinkToken, MentionToken } from './model';

export type MentionResolveOptions = {
  room?: Room;
  nicknames?: Nicknames;
  mxUserId?: string;
};

/** Same @-prefix rule as {@link UserMentionAutocomplete} and timeline mention insertion. */
export const formatUserMentionDisplayName = (name: string): string =>
  name.startsWith('@') ? name : `@${name}`;

export const resolveUserMentionName = (userId: string, options?: MentionResolveOptions): string => {
  const base =
    (options?.room && getMemberDisplayName(options.room, userId, options.nicknames)) ??
    getMxIdLocalPart(userId) ??
    userId;
  return formatUserMentionDisplayName(base);
};

/** {@link UserMentionAutocomplete} passes a display label, @room must stay literal, not resolved as a user. */
export const mentionNameForUserAutocomplete = (
  id: string,
  displayName: string,
  options?: MentionResolveOptions
): string => {
  if (displayName === '@room') return '@room';
  return resolveUserMentionName(id, options);
};

/** Same #-prefix rule as {@link RoomMentionAutocomplete}. */
const formatRoomMentionDisplayName = (name: string): string => {
  if (name === '@room') return '@room';
  return name.startsWith('#') ? name : `#${name}`;
};

export const resolveRoomMentionName = (
  roomIdOrAlias: string,
  label: string,
  options?: MentionResolveOptions
): string => {
  const trimmed = label.trim();
  if (trimmed === '@room') return '@room';
  if (trimmed) return formatRoomMentionDisplayName(trimmed);
  if (
    options?.room &&
    (options.room.roomId === roomIdOrAlias || options.room.getCanonicalAlias() === roomIdOrAlias)
  ) {
    return formatRoomMentionDisplayName(options.room.name || roomIdOrAlias);
  }
  return formatRoomMentionDisplayName(roomIdOrAlias);
};

export const resolveUserMentionHighlight = (
  userId: string,
  options?: MentionResolveOptions
): boolean => options?.mxUserId === userId;

export const resolveRoomMentionHighlight = (
  roomIdOrAlias: string,
  options?: MentionResolveOptions
): boolean => {
  if (!options?.room) return true;
  const { roomId } = options.room;
  const alias = options.room.getCanonicalAlias();
  return roomId === roomIdOrAlias || alias === roomIdOrAlias;
};

export const formatMentionElementDisplayName = (element: MentionToken): string => {
  if (isUserId(element.id)) {
    return formatUserMentionDisplayName(element.name);
  }
  if (element.name === '@room') return '@room';
  return formatRoomMentionDisplayName(element.name);
};

export const createMentionElement = (
  id: string,
  name: string,
  highlight: boolean,
  eventId?: string,
  viaServers?: string[]
): MentionToken => ({
  type: BlockType.Mention,
  id,
  eventId,
  viaServers,
  highlight,
  name,
  children: [{ text: '' }],
});

export const createEmoticonElement = (key: string, shortcode: string): EmoticonToken => ({
  type: BlockType.Emoticon,
  key,
  shortcode,
  children: [{ text: '' }],
});

export const createLinkElement = (href: string, children: string | EditorText[]): LinkToken => ({
  type: BlockType.Link,
  href,
  children: typeof children === 'string' ? [{ text: children }] : children,
});

export const createCommandElement = (command: string): CommandToken => ({
  type: BlockType.Command,
  command,
  children: [{ text: '' }],
});

export const getMarkdownCodeSpanRanges = (text: string): [number, number][] => {
  const ranges: [number, number][] = [];
  let openRun: { start: number; length: number } | undefined;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '`') {
      let runEnd = index;
      while (runEnd < text.length && text[runEnd] === '`') {
        runEnd += 1;
      }

      const runLength = runEnd - index;
      if (!openRun) {
        openRun = { start: index, length: runLength };
      } else if (openRun.length === runLength) {
        ranges.push([openRun.start, runEnd]);
        openRun = undefined;
      }

      index = runEnd - 1;
    }
  }

  return ranges;
};

export const isInsideMarkdownCodeSpan = (
  start: number,
  end: number,
  codeSpanRanges: [number, number][]
): boolean => codeSpanRanges.some(([rangeStart, rangeEnd]) => start > rangeStart && end < rangeEnd);
