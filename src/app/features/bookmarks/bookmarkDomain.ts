/**
 * MSC4438: Message bookmarks via account data
 * https://github.com/matrix-org/matrix-spec-proposals/pull/4438
 *
 * Unstable event type names in use (will migrate to stable names once MSC is accepted):
 *   m.bookmarks.index  →  org.matrix.msc4438.bookmarks.index
 *   m.bookmark.<id>    →  org.matrix.msc4438.bookmark.<id>
 *
 * Bookmark ID algorithm: djb2-like 32-bit hash over "<roomId>|<eventId>", prefixed with "bmk_".
 * This matches the reference implementation in smokku/cinny commit 6363e441 and is used here for
 * cross-client interoperability.  If the algorithm ever changes, a migration must be provided so
 * that existing bookmarks can have their IDs recomputed (the ID is stored in the item event, so
 * old items remain accessible).
 */

import { MatrixEvent, Room } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';

export type BookmarkIndexContent = {
  version: 1;
  revision: number;
  updated_ts: number;
  bookmark_ids: string[];
};

export type BookmarkItemContent = {
  version: 1;
  bookmark_id: string;
  uri: string;
  room_id: string;
  event_id: string;
  event_ts: number;
  bookmarked_ts: number;
  sender?: string;
  room_name?: string;
  body_preview?: string;
  msgtype?: string;
  deleted?: boolean;
};

/**
 * Compute a bookmark ID for a (roomId, eventId) pair using the reference
 * djb2-style algorithm agreed upon with the Cinny proof-of-concept.
 *
 * Input string:  "<roomId>|<eventId>"
 * Algorithm:     For each UTF-16 code unit ch, hash = ((hash << 5) - hash + ch) | 0
 * Output:        "bmk_" + unsigned 32-bit hex, zero-padded to 8 chars
 *
 * NOTE: If this algorithm is ever changed, a migration helper must be written
 * so that existing bookmarked items (whose IDs are stored on the server as
 * account data event-type suffixes) can still be resolved.  The bookmark_id
 * field inside each item event is the canonical reference.
 */
export function computeBookmarkId(roomId: string, eventId: string): string {
  const input = `${roomId}|${eventId}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) - hash + ch) | 0;
  }
  // Convert to unsigned 32-bit integer and encode as 8-char lowercase hex
  // eslint-disable-next-line no-bitwise
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `bmk_${hex}`;
}

/** Construct the account data event type for a bookmark item. */
export function bookmarkItemEventType(bookmarkId: string): string {
  return `${AccountDataEvent.BookmarkItemPrefix}${bookmarkId}`;
}

/**
 * Build a matrix: URI for a room event.
 * Canonical form: matrix:roomid/<encoded_room_id>/e/<encoded_event_id>
 * (MSC4438 §Matrix URI)
 */
export function buildMatrixURI(roomId: string, eventId: string): string {
  return `matrix:roomid/${encodeURIComponent(roomId)}/e/${encodeURIComponent(eventId)}`;
}

const BODY_PREVIEW_MAX_LENGTH = 120;

/**
 * Extract a short preview of the event body for display in the bookmark list.
 * Truncated to 120 chars with an ellipsis (MSC4438 §Body preview).
 *
 * Security: preview is only used as plain text in the UI, never parsed as HTML.
 * Encrypted-room callers may choose to pass an empty string to avoid leaking
 * plaintext into unencrypted account data (MSC4438 §Security considerations).
 */
export function extractBodyPreview(
  mEvent: MatrixEvent,
  maxLength = BODY_PREVIEW_MAX_LENGTH
): string {
  const content = mEvent.getContent();
  const body = content?.body;
  if (typeof body !== 'string' || body.length === 0) return '';
  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength)}\u2026`;
}

/**
 * Build a BookmarkItemContent from a room and event.
 *
 * Security: optional metadata (sender, room_name, body_preview) is copied into
 * unencrypted account data.  For encrypted rooms the caller may choose to omit
 * these fields, storing only the required fields (room_id, event_id, uri).
 * Currently we always populate them for usability; future work could honour a
 * "privacy mode" setting.
 */
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
    sender: mEvent.getSender() ?? undefined,
    room_name: room.name,
    body_preview: extractBodyPreview(mEvent),
    msgtype: mEvent.getContent()?.msgtype,
  };
}

// Validators (MSC4438: clients must validate before use)
export function isValidIndexContent(content: unknown): content is BookmarkIndexContent {
  if (typeof content !== 'object' || content === null) return false;
  const c = content as Record<string, unknown>;
  return (
    c.version === 1 &&
    typeof c.revision === 'number' &&
    typeof c.updated_ts === 'number' &&
    Array.isArray(c.bookmark_ids) &&
    (c.bookmark_ids as unknown[]).every((id) => typeof id === 'string')
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
