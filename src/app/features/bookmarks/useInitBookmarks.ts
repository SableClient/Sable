import { MatrixEvent, SyncState } from '$types/matrix-sdk';
import { useCallback, useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSyncState } from '$hooks/useSyncState';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { bookmarkListAtom, bookmarkLoadingAtom } from '$state/bookmarks';
import { AccountDataEvent } from '$types/matrix/accountData';
import { listBookmarks } from './bookmarkRepository';

/**
 * Top-level hook that keeps `bookmarkListAtom` in sync with account data.
 *
 * Must be called from an always-mounted component (e.g. ClientNonUIFeatures),
 * NOT from a page component.  Page components should simply read from the atom.
 *
 * Three triggers keep the atom current:
 *  1. `useEffect` on mount — covers the case where `ClientNonUIFeatures` mounts
 *     after the initial sync transition has already fired (the common case).
 *  2. `SyncState.Syncing` transition — refreshes on every reconnect.
 *  3. `ClientEvent.AccountData` for the index event type — reacts immediately
 *     to index updates pushed by other devices mid-session.
 */
export function useInitBookmarks(): void {
  const mx = useMatrixClient();
  const setList = useSetAtom(bookmarkListAtom);
  const setLoading = useSetAtom(bookmarkLoadingAtom);

  const loadBookmarks = useCallback(() => {
    setLoading(true);
    try {
      setList(listBookmarks(mx));
    } finally {
      setLoading(false);
    }
  }, [mx, setList, setLoading]);

  // Immediate load: fires once on mount to cover the case where ClientNonUIFeatures
  // mounts after the initial SyncState.Syncing transition has already fired.
  // loadBookmarks is stable (memoized with stable deps), so this fires exactly once.
  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  // Trigger on reconnect (SyncState.Syncing transition after a disconnect).
  useSyncState(
    mx,
    useCallback(
      (state, prevState) => {
        if (state === SyncState.Syncing && prevState !== SyncState.Syncing) {
          loadBookmarks();
        }
      },
      [loadBookmarks]
    )
  );

  // React to index updates pushed by other devices mid-session.
  useAccountDataCallback(
    mx,
    useCallback(
      (event: MatrixEvent) => {
        if (event.getType() === (AccountDataEvent.BookmarksIndex as string)) {
          loadBookmarks();
        }
      },
      [loadBookmarks]
    )
  );
}
