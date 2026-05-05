import { useEffect, useMemo, useState } from 'react';
import type { MatrixEvent, User, UserEventHandlerMap } from '$types/matrix-sdk';
import { ClientEvent, UserEvent } from '$types/matrix-sdk';
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

const getUserPresence = (user: User): UserPresence => ({
  presence: user.presence as Presence,
  status: user.presenceStatusMsg,
  active: user.currentlyActive,
  lastActiveTs: user.getLastActiveTs(),
});

export const useUserPresence = (userId: string): UserPresence | undefined => {
  const mx = useMatrixClient();
  const user = mx.getUser(userId);
  const [presence, setPresence] = useState(() => (user ? getUserPresence(user) : undefined));

  useEffect(() => {
    if (!user) {
      setPresence(undefined);

      // When the user isn't in the SDK store yet (e.g., presence arrived before
      // any membership event), listen on the client for incoming events so we
      // can re-evaluate once a presence event for this user is stored.
      const handleEvent = (event: MatrixEvent) => {
        if (event.getType() !== 'm.presence') return;
        const sender = event.getSender();
        if (sender !== userId) return;
        const latestUser = mx.getUser(userId);
        if (latestUser) setPresence(getUserPresence(latestUser));
      };
      mx.on(ClientEvent.Event, handleEvent);
      return () => {
        mx.removeListener(ClientEvent.Event, handleEvent);
      };
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
  }, [mx, user, userId]);

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
