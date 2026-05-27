import { useEffect, useMemo, useState } from 'react';
import type { User, UserEventHandlerMap } from '$types/matrix-sdk';
import { UserEvent } from '$types/matrix-sdk';
import { useMatrixClient } from './useMatrixClient';

export enum Presence {
  Online = 'online',
  Unavailable = 'unavailable',
  Offline = 'offline',
}

export type UserPresence = {
  presence: Presence;
  status?: string;
  active: boolean;
  lastActiveTs?: number;
};

const getUserPresence = (user: User): UserPresence => {
  const rawPresence = user.presence as Presence;
  const statusMsg = user.presenceStatusMsg ?? '';
  // DND is encoded as online + status_msg starting with '[dnd]'. Decode it back
  // so the badge renders red for any Sable client, not just the sender's own account switcher.
  const isDnd = rawPresence === Presence.Online && statusMsg.startsWith('[dnd]');
  const presence = isDnd ? Presence.Dnd : rawPresence;

  // Strip the [dnd] prefix when displaying status in Sable
  let displayStatus: string | undefined;
  if (isDnd) {
    // Remove '[dnd]' prefix and any following space, show remaining custom status
    const withoutPrefix = statusMsg.slice(5).trimStart();
    displayStatus = withoutPrefix || undefined;
  } else {
    displayStatus = statusMsg || undefined;
  }

  return {
    presence,
    status: displayStatus,
    active: user.currentlyActive,
    lastActiveTs: user.getLastActiveTs(),
  };
};

export const useUserPresence = (userId: string): UserPresence | undefined => {
  const mx = useMatrixClient();
  const user = mx.getUser(userId);
  const [presence, setPresence] = useState(() => (user ? getUserPresence(user) : undefined));

  useEffect(() => {
    if (!user) {
      setPresence(undefined);
      return undefined;
    }
    setPresence(getUserPresence(user));
    const updatePresence: UserEventHandlerMap[UserEvent.Presence] = (e, u) => {
      if (u.userId === user.userId) {
        setPresence(getUserPresence(user));
      }
    };
    user.on(UserEvent.Presence, updatePresence);
    user.on(UserEvent.CurrentlyActive, updatePresence);
    user.on(UserEvent.LastPresenceTs, updatePresence);

    return () => {
      user.removeListener(UserEvent.Presence, updatePresence);
      user.removeListener(UserEvent.CurrentlyActive, updatePresence);
      user.removeListener(UserEvent.LastPresenceTs, updatePresence);
    };
  }, [user]);

  return presence;
};

export const usePresenceLabel = (): Record<Presence, string> =>
  useMemo(
    () => ({
      [Presence.Online]: 'Active',
      [Presence.Unavailable]: 'Busy',
      [Presence.Offline]: 'Away',
    }),
    []
  );
