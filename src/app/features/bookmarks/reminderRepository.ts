/* oxlint-disable typescript/no-explicit-any -- custom account data event types require `as any` */

import type { MatrixClient } from '$types/matrix-sdk';
import { CustomAccountDataEvent as AccountDataEvent } from '$types/matrix/accountData';
import type { BookmarkReminder, BookmarksRemindersContent } from '$types/matrix/accountData';

function readReminders(mx: MatrixClient): BookmarkReminder[] {
  const evt = mx.getAccountData(AccountDataEvent.SableBookmarksReminders as any);
  const content = evt?.getContent<BookmarksRemindersContent>();
  return content?.reminders ?? [];
}

async function writeReminders(mx: MatrixClient, reminders: BookmarkReminder[]): Promise<void> {
  await mx.setAccountData(
    AccountDataEvent.SableBookmarksReminders as any,
    {
      reminders,
    } as any
  );
}

/**
 * Set (or update) a reminder for a specific bookmark.
 * If a reminder already exists for `bookmarkId`, it is replaced.
 */
export async function setBookmarkReminder(
  mx: MatrixClient,
  reminder: BookmarkReminder
): Promise<void> {
  const existing = readReminders(mx).filter((r) => r.bookmarkId !== reminder.bookmarkId);
  await writeReminders(mx, [...existing, reminder]);
}

/**
 * Remove the reminder for a specific bookmark, if one exists.
 */
export async function clearBookmarkReminder(mx: MatrixClient, bookmarkId: string): Promise<void> {
  const updated = readReminders(mx).filter((r) => r.bookmarkId !== bookmarkId);
  await writeReminders(mx, updated);
}

/**
 * Read all current reminders from account data (synchronous, from local cache).
 */
export function listReminders(mx: MatrixClient): BookmarkReminder[] {
  return readReminders(mx);
}
