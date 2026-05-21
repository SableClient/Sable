import type { InlineElement } from './slate';
import {
  parseMatrixToRoom,
  parseMatrixToRoomEvent,
  parseMatrixToUser,
  isMatrixToMentionHref,
} from '$plugins/matrix-to';
import type { MentionResolveOptions } from './utils';
import {
  createMentionElement,
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
): InlineElement | null => {
  const trimmedHref = href.trim();
  if (!isMatrixToMentionHref(trimmedHref)) return null;

  const userId = parseMatrixToUser(trimmedHref);
  if (userId) {
    return createMentionElement(
      userId,
      resolveUserMentionName(userId, options),
      resolveUserMentionHighlight(userId, options)
    );
  }

  const roomEvent = parseMatrixToRoomEvent(trimmedHref);
  if (roomEvent) {
    return createMentionElement(
      roomEvent.roomIdOrAlias,
      resolveRoomMentionName(roomEvent.roomIdOrAlias, label, options),
      resolveRoomMentionHighlight(roomEvent.roomIdOrAlias, options),
      roomEvent.eventId,
      roomEvent.viaServers
    );
  }

  const room = parseMatrixToRoom(trimmedHref);
  if (room) {
    return createMentionElement(
      room.roomIdOrAlias,
      resolveRoomMentionName(room.roomIdOrAlias, label, options),
      resolveRoomMentionHighlight(room.roomIdOrAlias, options),
      undefined,
      room.viaServers
    );
  }

  return null;
};

export const expandMatrixMentionMarkdownInText = (
  text: string,
  options?: MentionResolveOptions
): InlineElement[] => {
  const codeSpanRanges = getMarkdownCodeSpanRanges(text);
  const parts: InlineElement[] = [];
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
