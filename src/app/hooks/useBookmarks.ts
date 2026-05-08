/* eslint-disable typescript/no-explicit-any -- MatrixClient.setAccountData only accepts
   SDK-known event types (keyof AccountDataEvents); custom MSC4438 account data event types
   require `as any` to bypass the constraint without a full SDK fork. */
import { useCallback, useEffect, useState } from 'react';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { ClientEvent } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

export type BookmarkEntry = {
  event_id: string;
  room_id: string;
  /** MSC4438 bookmark key suffix, e.g. "bmk_a1b2c3d4" */
  id: string;
};

// ---------------------------------------------------------------------------
// MSC4438 helpers
// ---------------------------------------------------------------------------

const BOOKMARK_PREFIX = CustomAccountDataEvent.BookmarkItemPrefix; // 'org.matrix.msc4438.bookmark.'
const INDEX_KEY = CustomAccountDataEvent.BookmarksIndex; // 'org.matrix.msc4438.bookmarks.index'

function generateBookmarkId(): string {
  // 8 random hex chars, prefixed with "bmk_"
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `bmk_${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

function getIndexIds(mx: MatrixClient): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom MSC event type not in SDK AccountDataEvents
  const ev = mx.getAccountData(INDEX_KEY as any);
  if (!ev) return [];
  const content = ev.getContent<{ bookmark_ids?: string[] }>();
  return Array.isArray(content.bookmark_ids) ? content.bookmark_ids : [];
}

export function readBookmarks(mx: MatrixClient): BookmarkEntry[] {
  const ids = getIndexIds(mx);
  const entries: BookmarkEntry[] = [];
  for (const id of ids) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom MSC event type not in SDK AccountDataEvents
    const ev = mx.getAccountData(`${BOOKMARK_PREFIX}${id}` as any);
    if (!ev) continue;
    const c = ev.getContent<{ room_id?: string; event_id?: string; deleted?: boolean }>();
    if (!c.deleted && c.room_id && c.event_id) {
      entries.push({ id, room_id: c.room_id, event_id: c.event_id });
    }
  }
  return entries;
}

export function readArchivedBookmarks(mx: MatrixClient): BookmarkEntry[] {
  const ids = getIndexIds(mx);
  const entries: BookmarkEntry[] = [];
  for (const id of ids) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom MSC event type not in SDK AccountDataEvents
    const ev = mx.getAccountData(`${BOOKMARK_PREFIX}${id}` as any);
    if (!ev) continue;
    const c = ev.getContent<{ room_id?: string; event_id?: string; deleted?: boolean }>();
    if (c.deleted && c.room_id && c.event_id) {
      entries.push({ id, room_id: c.room_id, event_id: c.event_id });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookmarks(): BookmarkEntry[] {
  const mx = useMatrixClient();
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(() => readBookmarks(mx));

  const refresh = useCallback(() => setBookmarks(readBookmarks(mx)), [mx]);

  useEffect(() => {
    refresh();
    const handler = (event: MatrixEvent) => {
      const type = event.getType();
      if (type === INDEX_KEY || type.startsWith(BOOKMARK_PREFIX)) {
        refresh();
      }
    };
    mx.on(ClientEvent.AccountData, handler);
    return () => {
      mx.off(ClientEvent.AccountData, handler);
    };
  }, [mx, refresh]);

  return bookmarks;
}

export function useArchivedBookmarks(): BookmarkEntry[] {
  const mx = useMatrixClient();
  const [archived, setArchived] = useState<BookmarkEntry[]>(() => readArchivedBookmarks(mx));

  const refresh = useCallback(() => setArchived(readArchivedBookmarks(mx)), [mx]);

  useEffect(() => {
    refresh();
    const handler = (event: MatrixEvent) => {
      const type = event.getType();
      if (type === INDEX_KEY || type.startsWith(BOOKMARK_PREFIX)) {
        refresh();
      }
    };
    mx.on(ClientEvent.AccountData, handler);
    return () => {
      mx.off(ClientEvent.AccountData, handler);
    };
  }, [mx, refresh]);

  return archived;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function isBookmarked(bookmarks: BookmarkEntry[], eventId: string): boolean {
  return bookmarks.some((b) => b.event_id === eventId);
}

export async function toggleBookmark(
  mx: MatrixClient,
  roomId: string,
  eventId: string,
  currentBookmarks: BookmarkEntry[]
): Promise<void> {
  const existing = currentBookmarks.find((b) => b.event_id === eventId);
  if (existing) {
    // Archive: keep the id in the index so the archive section can find it,
    // mark as deleted but retain room_id + event_id so readArchivedBookmarks
    // can reconstruct the entry.
    await mx.setAccountData(
      `${BOOKMARK_PREFIX}${existing.id}` as any,
      {
        deleted: true,
        bookmark_id: existing.id,
        room_id: existing.room_id,
        event_id: existing.event_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    );
  } else {
    // Add: write individual event, then update index
    const id = generateBookmarkId();
    await mx.setAccountData(
      `${BOOKMARK_PREFIX}${id}` as any,
      {
        room_id: roomId,
        event_id: eventId,
        bookmark_id: id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    );
    const newIds = [...currentBookmarks.map((b) => b.id), id];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom MSC event type not in SDK AccountDataEvents
    await (mx.setAccountData as any)(INDEX_KEY, { bookmark_ids: newIds });
  }
}

/** Restore an archived bookmark back to the active list. */
export async function restoreBookmark(mx: MatrixClient, entry: BookmarkEntry): Promise<void> {
  await mx.setAccountData(
    `${BOOKMARK_PREFIX}${entry.id}` as any,
    {
      room_id: entry.room_id,
      event_id: entry.event_id,
      bookmark_id: entry.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  );
}

/**
 * Permanently remove a bookmark: strip it from the index and clear its
 * account data entry so it no longer consumes account data space.
 */
export async function permanentlyDeleteBookmark(
  mx: MatrixClient,
  entry: BookmarkEntry,
  allIds: string[]
): Promise<void> {
  const newIds = allIds.filter((id) => id !== entry.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom MSC event type not in SDK AccountDataEvents
  await (mx.setAccountData as any)(INDEX_KEY, { bookmark_ids: newIds });
  // Clear the individual event data — write a minimal tombstone so syncing
  // clients discard the entry rather than seeing a stale object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (mx.setAccountData as any)(`${BOOKMARK_PREFIX}${entry.id}`, { deleted: true });
}
