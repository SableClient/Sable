import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { useStore } from 'jotai/react';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { SyncState } from '$types/matrix-sdk';
import { shareInboxClear, shareInboxDrain, shareInboxRead } from '$generated/tauri/commands';
import { pendingShareAtom } from '$state/shareTarget';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useSyncState } from '$hooks/useSyncState';
import { useMessageTargetRooms } from '$hooks/useMessageTargetRooms';
import { encryptFile } from '$utils/matrix';
import { safeUploadFile } from '$utils/mimeTypes';
import { createLogger } from '$utils/debug';
import { plainToEditorInput } from '$components/editor/input';
import {
  roomIdToMsgDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  type TUploadItem,
} from '$state/room/roomInputDrafts';
import { SearchWrapper } from '$features/navigate';
import {
  collectShareFiles,
  collectShareText,
  displayFileName,
  isShareDeepLink,
  mergeShareBatches,
} from './shareContent';

const log = createLogger('ShareTargetFeature');

const isMobileTauri = (): boolean => {
  if (!isTauri()) return false;
  const os = osType();
  return os === 'android' || os === 'ios';
};

export function ShareTargetFeature() {
  const mx = useMatrixClient();
  const store = useStore();
  const { navigateRoom } = useRoomNavigate();
  const [pending, setPending] = useAtom(pendingShareAtom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(() => mx.getSyncState() === SyncState.Syncing);
  // Guards against an in-flight drain resurrecting already-consumed batches.
  const consumedRef = useRef(new Set<string>());

  useSyncState(
    mx,
    useCallback((state) => {
      if (state === SyncState.Syncing) setSyncing(true);
    }, [])
  );

  useEffect(() => {
    if (!isMobileTauri()) return undefined;

    let mounted = true;
    let unlisten: (() => void) | undefined;

    const drain = async () => {
      try {
        const batches = (await shareInboxDrain()).filter(
          (batch) => !consumedRef.current.has(batch.batchId)
        );
        if (!mounted || batches.length === 0) return;
        setPending((prev) => ({ batches: mergeShareBatches(prev?.batches ?? [], batches) }));
      } catch (err) {
        log.warn('Failed to drain share inbox:', err);
      }
    };

    drain();

    (async () => {
      try {
        const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
        const removeListener = await onOpenUrl((urls) => {
          if (urls.some(isShareDeepLink)) drain();
        });
        if (mounted) {
          unlisten = removeListener;
        } else {
          removeListener();
        }
      } catch (err) {
        log.warn('Failed to listen for share deep links:', err);
      }
    })();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') drain();
    };
    let unlistenShareReceived: (() => void) | undefined;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen('share-received', () => drain()))
      .then((removeShareListener) => {
        if (mounted) unlistenShareReceived = removeShareListener;
        else removeShareListener();
      })
      .catch((err) => log.warn('Failed to listen for share events:', err));
    // Android only: covers a cold-start SEND intent beating the deep-link
    // plugin. On iOS edge-swipe gestures fire visibilitychange.
    if (osType() === 'android') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      mounted = false;
      unlisten?.();
      unlistenShareReceived?.();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [setPending]);

  const shareTargets = useMessageTargetRooms();

  const handleClose = useCallback(async () => {
    if (busy || !pending) return;
    const batchIds = pending.batches.map((batch) => batch.batchId);
    batchIds.forEach((id) => consumedRef.current.add(id));
    try {
      await Promise.all(batchIds.map((id) => shareInboxClear({ batchId: id })));
    } catch (err) {
      log.warn('Failed to clear share inbox:', err);
    }
    setPending(null);
    setError(null);
  }, [busy, pending, setPending]);

  const stageIntoRoom = useCallback(
    async (roomId: string) => {
      if (!pending) return;
      setBusy(true);
      setError(null);
      pending.batches.forEach((batch) => consumedRef.current.add(batch.batchId));
      try {
        const room = mx.getRoom(roomId);
        if (!room) throw new Error('Room not found');

        const text = collectShareText(pending.batches);
        if (text) {
          store.set(roomIdToMsgDraftAtomFamily(roomId), plainToEditorInput(text));
        }

        const fileRefs = collectShareFiles(pending.batches);
        if (fileRefs.length > 0) {
          const files = await Promise.all(
            fileRefs.map(async (ref) => {
              const buffer = (await shareInboxRead({
                batchId: ref.batchId,
                fileName: ref.fileName,
              })) as ArrayBuffer;
              return new File([buffer], displayFileName(ref.fileName), {
                type: ref.mime ?? 'application/octet-stream',
              });
            })
          );

          const safeFiles = await Promise.all(files.map(safeUploadFile));
          const fileItems: TUploadItem[] = [];
          if (room.hasEncryptionStateEvent()) {
            const encryptedFiles = await Promise.all(safeFiles.map((f) => encryptFile(f)));
            encryptedFiles.forEach((ef) =>
              fileItems.push({ ...ef, metadata: { markedAsSpoiler: false } })
            );
          } else {
            safeFiles.forEach((f) =>
              fileItems.push({
                file: f,
                originalFile: f,
                encInfo: undefined,
                metadata: { markedAsSpoiler: false },
              })
            );
          }
          store.set(roomIdToUploadItemsAtomFamily(roomId), { type: 'PUT', item: fileItems });
        }

        await Promise.all(pending.batches.map((b) => shareInboxClear({ batchId: b.batchId })));
        setPending(null);
        // replace, not push: a push records a WebKit swipe-back snapshot with
        // the modal still on screen, replayed on every later edge-swipe.
        navigateRoom(roomId, undefined, { replace: true });
      } catch (err) {
        log.warn('Failed to stage shared content:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [pending, mx, store, navigateRoom, setPending]
  );

  const pickRoom = useMemo(
    () => ({
      title: 'Share to',
      eligibleRoomIds: shareTargets,
      onPickRoom: (roomId: string) => {
        stageIntoRoom(roomId);
      },
      errorMessage: error ? `Failed to share: ${error}` : null,
      busy,
    }),
    [shareTargets, stageIntoRoom, error, busy]
  );

  if (!pending || !syncing) return null;

  return <SearchWrapper requestClose={handleClose} pickRoom={pickRoom} />;
}
