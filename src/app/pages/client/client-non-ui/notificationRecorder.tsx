import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { ClientEvent, EventType, SyncState } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { mDirectAtom } from '$state/mDirectList';
import { arePushRulesReady } from '$utils/localNotifications';
import { runLiveTimelineScan } from '$utils/localNotificationBackfill';

const isReady = (state: SyncState | null): boolean =>
  state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup;

export function NotificationRecorder() {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const [storeContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [storeEncryptedContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const mDirectsRef = useRef(mDirects);
  mDirectsRef.current = mDirects;
  const contentRef = useRef({ storeContent, storeEncryptedContent });
  contentRef.current = {
    storeContent,
    storeEncryptedContent: storeContent && storeEncryptedContent,
  };
  const startedFor = useRef<MatrixClient | undefined>(undefined);

  useEffect(() => {
    const start = () => {
      if (startedFor.current === mx || !isReady(mx.getSyncState()) || !arePushRulesReady(mx)) {
        return;
      }
      startedFor.current = mx;
      const content = contentRef.current;
      void runLiveTimelineScan(mx, mx.getSafeUserId(), mDirectsRef.current, content).catch(
        () => undefined
      );
    };
    const onSync = () => start();
    const onAccountData = (event: MatrixEvent) => {
      if (event.getType() === (EventType.PushRules as string)) start();
    };
    mx.on(ClientEvent.Sync, onSync);
    mx.on(ClientEvent.AccountData, onAccountData);
    start();

    return () => {
      mx.off(ClientEvent.Sync, onSync);
      mx.off(ClientEvent.AccountData, onAccountData);
    };
  }, [mx]);

  return null;
}
