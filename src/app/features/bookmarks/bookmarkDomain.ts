import { MATRIX_SABLE_UNSTABLE_BOOKMARK_ITEM_EVENT_PREFIX } from '$unstable/prefixes';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import type { BookmarkIndexContent, BookmarkItemContent } from '$types/matrix-sdk-events';

export function computeBookmarkId(roomId: string, eventId: string): string {
  const input = `${roomId}|${eventId}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `bmk_${hex}`;
}

export function bookmarkItemEventType(bookmarkId: string): string {
  return `${MATRIX_SABLE_UNSTABLE_BOOKMARK_ITEM_EVENT_PREFIX}${bookmarkId}`;
}

export function buildMatrixURI(roomId: string, eventId: string): string {
  return `matrix:roomid/${encodeURIComponent(roomId)}/e/${encodeURIComponent(eventId)}`;
}

export function extractBodyPreview(mEvent: MatrixEvent, maxLength = 120): string {
  const content = mEvent.getContent();
  const body = content?.body;
  if (typeof body !== 'string' || body.length === 0) return '';
  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength)}…`;
}

export function createBookmarkItem(
  room: Room,
  mEvent: MatrixEvent
): BookmarkItemContent | undefined {
  const eventId = mEvent.getId();
  const { roomId } = room;
  if (!eventId) return undefined;

  const bookmarkId = computeBookmarkId(roomId, eventId);

  return {
    version: 1,
    bookmark_id: bookmarkId,
    uri: buildMatrixURI(roomId, eventId),
    room_id: roomId,
    event_id: eventId,
    event_ts: mEvent.getTs(),
    bookmarked_ts: Date.now(),
    sender: mEvent.getSender(),
    room_name: room.name,
    body_preview: mEvent.isEncrypted() ? undefined : extractBodyPreview(mEvent),
    msgtype: mEvent.getContent()?.msgtype,
  };
}

export function isValidIndexContent(content: unknown): content is BookmarkIndexContent {
  if (typeof content !== 'object' || content === null) return false;
  const c = content as Record<string, unknown>;
  return (
    c.version === 1 &&
    typeof c.revision === 'number' &&
    typeof c.updated_ts === 'number' &&
    Array.isArray(c.bookmark_ids) &&
    c.bookmark_ids.every((id: unknown) => typeof id === 'string')
  );
}

export function isValidBookmarkItem(content: unknown): content is BookmarkItemContent {
  if (typeof content !== 'object' || content === null) return false;
  const c = content as Record<string, unknown>;
  return (
    c.version === 1 &&
    typeof c.bookmark_id === 'string' &&
    typeof c.uri === 'string' &&
    typeof c.room_id === 'string' &&
    typeof c.event_id === 'string' &&
    typeof c.event_ts === 'number' &&
    typeof c.bookmarked_ts === 'number'
  );
}

export function emptyIndex(): BookmarkIndexContent {
  return {
    version: 1,
    revision: 0,
    updated_ts: Date.now(),
    bookmark_ids: [],
  };
}
