import { useCallback, useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { CustomAccountDataEvent as AccountDataEvent } from '$types/matrix/accountData';
import type { BookmarkReminder, BookmarksRemindersContent } from '$types/matrix/accountData';
import type { MatrixEvent } from '$types/matrix-sdk';
import { remindersAtom } from '$state/bookmarks';

function postRemindersToSW(reminders: BookmarkReminder[]): void {
  if (!('serviceWorker' in navigator)) return;
  const payload = { type: 'updateReminders', reminders };
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.active?.postMessage(payload);
    })
    .catch(() => undefined);
}

async function tryRegisterPeriodicSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return;
    await (
      reg as ServiceWorkerRegistration & {
        periodicSync: { register(tag: string, opts: { minInterval: number }): Promise<void> };
      }
    ).periodicSync.register('check-reminders', {
      minInterval: 60 * 60 * 1000, // 1 hour — browser controls actual frequency
    });
  } catch {
    // periodicSync unavailable or site engagement too low — SW interval is the fallback.
  }
}

/**
 * Reads bookmark reminders from Matrix account data and pushes them to the
 * service worker cache whenever they change.  The SW uses this cache to fire
 * reminder notifications while the app is in a background tab (setInterval)
 * or fully closed (periodicSync on Chromium).
 *
 * Must be called from an always-mounted component (e.g. ClientNonUIFeatures).
 */
export function useReminderSync(): void {
  const mx = useMatrixClient();
  const setReminders = useSetAtom(remindersAtom);

  const syncReminders = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accountDataEvent = mx.getAccountData(AccountDataEvent.SableBookmarksReminders as any);
    const content = accountDataEvent?.getContent<BookmarksRemindersContent>();
    const reminders = content?.reminders ?? [];
    setReminders(reminders);
    postRemindersToSW(reminders);
  }, [mx, setReminders]);

  // Initial sync on mount — covers the common case where ClientNonUIFeatures
  // mounts after the initial sync has already fired.
  useEffect(() => {
    syncReminders();
    tryRegisterPeriodicSync().catch(() => undefined);
  }, [syncReminders]);

  // React to account data changes pushed by other devices mid-session.
  useAccountDataCallback(
    mx,
    useCallback(
      (mxEvent: MatrixEvent) => {
        if (mxEvent.getType() === (AccountDataEvent.SableBookmarksReminders as string)) {
          syncReminders();
        }
      },
      [syncReminders]
    )
  );
}
