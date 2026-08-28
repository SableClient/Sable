import type { InlineToken } from './model';
import { BlockType } from './types';
import {
  parseMatrixToRoom,
  parseMatrixToRoomEvent,
  parseMatrixToUser,
  isMatrixToMentionHref,
} from '$plugins/matrix-to';
import type { MentionResolveOptions } from './utils';
import {
  getMarkdownCodeSpanRanges,
  isInsideMarkdownCodeSpan,
  resolveRoomMentionHighlight,
  resolveRoomMentionName,
  resolveUserMentionHighlight,
  resolveUserMentionName,
} from './utils';

/** [label](href) or [label](<href>) */
const MD_INLINE_LINK = /\[((?:[^\]\]\\]|\\.)*)\]\((?:<([^>]+)>|([^)]+))\)/g;

export const mentionFromMatrixToMarkdownLink = (
  label: string,
  href: string,
  options?: MentionResolveOptions
): InlineToken | null => {
  const trimmedHref = href.trim();
  if (!isMatrixToMentionHref(trimmedHref)) return null;

  const userId = parseMatrixToUser(trimmedHref);
  if (userId) {
    return {
      type: BlockType.Mention,
      id: userId,
      name: resolveUserMentionName(userId, options),
      highlight: resolveUserMentionHighlight(userId, options),
      children: [{ text: '' }],
    };
  }

  const roomEvent = parseMatrixToRoomEvent(trimmedHref);
  if (roomEvent) {
    return {
      type: BlockType.Mention,
      id: roomEvent.roomIdOrAlias,
      name: resolveRoomMentionName(roomEvent.roomIdOrAlias, label, options),
      highlight: resolveRoomMentionHighlight(roomEvent.roomIdOrAlias, options),
      eventId: roomEvent.eventId,
      viaServers: roomEvent.viaServers,
      children: [{ text: '' }],
    };
  }

  const room = parseMatrixToRoom(trimmedHref);
  if (room) {
    return {
      type: BlockType.Mention,
      id: room.roomIdOrAlias,
      name: resolveRoomMentionName(room.roomIdOrAlias, label, options),
      highlight: resolveRoomMentionHighlight(room.roomIdOrAlias, options),
      viaServers: room.viaServers,
      children: [{ text: '' }],
    };
  }

  return null;
};

export const expandMatrixMentionMarkdownInText = (
  text: string,
  options?: MentionResolveOptions
): InlineToken[] => {
  const codeSpanRanges = getMarkdownCodeSpanRanges(text);
  const parts: InlineToken[] = [];
  let last = 0;

  MD_INLINE_LINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MD_INLINE_LINK.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (isInsideMarkdownCodeSpan(start, end, codeSpanRanges)) continue;

    const label = match[1] ?? '';
    const href = (match[2] ?? match[3] ?? '').trim();

    if (start > last) {
      parts.push({ text: text.slice(last, start) });
    }

    const mention = mentionFromMatrixToMarkdownLink(label, href, options);
    if (mention) {
      parts.push(mention);
    } else {
      parts.push({ text: match[0] });
    }
    last = end;
  }

  if (last < text.length) {
    parts.push({ text: text.slice(last) });
  }

  return parts.length > 0 ? parts : [{ text: '' }];
};
