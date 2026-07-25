import { useEffect } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getPresenceSyncManager } from '$client/initMatrix';
import { SetPresence } from '$types/matrix-sdk';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useSlidingSyncActiveRoom } from '$hooks/useSlidingSyncActiveRoom';
import { useSettingsSyncEffect } from '$hooks/useSettingsSync';

export function SlidingSyncActiveRoomSubscriber() {
  useSlidingSyncActiveRoom();
  return null;
}

export function PresenceFeature() {
  const mx = useMatrixClient();
  const [sendPresence] = useSetting(settingsAtom, 'sendPresence');

  useEffect(() => {
    // Classic sync / MSC4186 presence: set_presence query param on every /sync poll.
    // Passing undefined restores the default (online); Offline suppresses broadcasting.
    const syncPresence = sendPresence ? undefined : SetPresence.Offline;
    mx.setSyncPresence(syncPresence);
    getPresenceSyncManager(mx)?.setPresenceEnabled(sendPresence);
  }, [mx, sendPresence]);

  return null;
}

export function SettingsSyncFeature() {
  useSettingsSyncEffect();
  return null;
}
