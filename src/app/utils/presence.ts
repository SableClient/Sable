import type { MatrixClient } from 'matrix-js-sdk';
import { SetPresence } from 'matrix-js-sdk';
import { getPresenceSyncManager } from '$client/initMatrix';
import { Presence } from '../hooks/useUserPresence';

const PRESENCE_TO_SET_PRESENCE: Record<Presence, SetPresence> = {
  [Presence.Online]: SetPresence.Online,
  [Presence.Unavailable]: SetPresence.Unavailable,
  [Presence.Offline]: SetPresence.Offline,
};

const presenceToSetPresence = (presence: Presence): SetPresence =>
  PRESENCE_TO_SET_PRESENCE[presence];

export const setUserPresence = async (
  mx: MatrixClient,
  presence: Presence,
  statusMsg?: string
): Promise<void> => {
  const setPresence = presenceToSetPresence(presence);
  getPresenceSyncManager(mx)?.setDesiredPresence(setPresence);
  await Promise.all([
    mx.setSyncPresence(setPresence),
    mx.setPresence({
      presence,
      status_msg: statusMsg,
    }),
  ]);
};
