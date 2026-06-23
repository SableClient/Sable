import type { AccountDataEvents, MatrixClient } from 'matrix-js-sdk';
import {
  bookmarkItemEventType,
  emptyIndex,
  isValidBookmarkItem,
  isValidIndexContent,
} from './bookmarkDomain';
import type { BookmarkIndexContent, BookmarkItemContent } from '$types/matrix-sdk-events';
import { MATRIX_SABLE_UNSTABLE_BOOKMARKS_INDEX_EVENT } from '$unstable/prefixes';

function readIndex(mx: MatrixClient): BookmarkIndexContent {
  const evt = mx.getAccountData(MATRIX_SABLE_UNSTABLE_BOOKMARKS_INDEX_EVENT);
  const content = evt?.getContent();
  if (isValidIndexContent(content)) return content;
  return emptyIndex();
}

async function readIndexFromServer(mx: MatrixClient): Promise<BookmarkIndexContent> {
  const content = await mx.getAccountDataFromServer(MATRIX_SABLE_UNSTABLE_BOOKMARKS_INDEX_EVENT);
  if (isValidIndexContent(content)) return content;
  return emptyIndex();
}

async function readItemFromServer(
  mx: MatrixClient,
  bookmarkId: string
): Promise<BookmarkItemContent | undefined> {
  const content = await mx.getAccountDataFromServer(
    bookmarkItemEventType(bookmarkId) as keyof AccountDataEvents
  );
  if (isValidBookmarkItem(content) && !content.deleted) return content;
  return undefined;
}

async function writeIndex(mx: MatrixClient, index: BookmarkIndexContent): Promise<void> {
  await mx.setAccountData(MATRIX_SABLE_UNSTABLE_BOOKMARKS_INDEX_EVENT, index);
}

async function writeItem(mx: MatrixClient, item: BookmarkItemContent): Promise<void> {
  await mx.setAccountData(bookmarkItemEventType(item.bookmark_id) as keyof AccountDataEvents, item);
}

type IndexMutator = (index: BookmarkIndexContent) => BookmarkIndexContent;

async function mutateIndex(mx: MatrixClient, mutate: IndexMutator): Promise<void> {
  const currentIndex = await readIndexFromServer(mx);
  const nextIndex = mutate(currentIndex);
  await writeIndex(mx, nextIndex);
}

export async function addBookmark(mx: MatrixClient, item: BookmarkItemContent): Promise<void> {
  await writeItem(mx, item);

  await mutateIndex(mx, (index) => {
    const ids = index.bookmark_ids.includes(item.bookmark_id)
      ? index.bookmark_ids
      : [item.bookmark_id, ...index.bookmark_ids];

    return {
      ...index,
      bookmark_ids: ids,
      revision: index.revision + 1,
      updated_ts: Date.now(),
    };
  });
}

export async function removeBookmark(mx: MatrixClient, bookmarkId: string): Promise<void> {
  await mutateIndex(mx, (index) => ({
    ...index,
    bookmark_ids: index.bookmark_ids.filter((id) => id !== bookmarkId),
    revision: index.revision + 1,
    updated_ts: Date.now(),
  }));

  const existing = await readItemFromServer(mx, bookmarkId);
  if (existing) {
    await writeItem(mx, { ...existing, deleted: true });
  }
}

export async function listBookmarks(mx: MatrixClient): Promise<BookmarkItemContent[]> {
  const index = await readIndexFromServer(mx);
  const items = await Promise.all(index.bookmark_ids.map((id) => readItemFromServer(mx, id)));
  return items.filter((item): item is BookmarkItemContent => item != null);
}

export function isBookmarked(mx: MatrixClient, bookmarkId: string): boolean {
  const index = readIndex(mx);
  return index.bookmark_ids.includes(bookmarkId);
}
