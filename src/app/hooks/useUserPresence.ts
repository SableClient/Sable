import { useEffect, useMemo, useState } from 'react';
import { ClientEvent, MatrixEvent, User, UserEvent, UserEventHandlerMap } from '$types/matrix-sdk';
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
    setPresence(user ? getUserPresence(user) : undefined);

    let cancelled = false;

    // Sliding sync (Synapse MSC4186) has no presence extension — m.presence events are never
    // delivered via sync. As a result, User.presence stays at the SDK default and
    // getLastActiveTs() stays 0. Fall back to a direct REST fetch to bootstrap presence state.
    if (!user || user.getLastActiveTs() === 0) {
      mx.getPresence(userId)
        .then((resp) => {
          if (cancelled) return;
          setPresence({
            presence: resp.presence as Presence,
            status: resp.status_msg,
            active: resp.currently_active ?? false,
            lastActiveTs:
              resp.last_active_ago != null ? Date.now() - resp.last_active_ago : undefined,
          });
        })
        .catch(() => {
          // Presence not available on this server (404 or not supported) — keep existing state.
        });
    }

    const updatePresence: UserEventHandlerMap[UserEvent.Presence] = (event, u) => {
      if (u.userId === userId) {
        setPresence(getUserPresence(u));
      }
    };
    user?.on(UserEvent.Presence, updatePresence);
    user?.on(UserEvent.CurrentlyActive, updatePresence);
    user?.on(UserEvent.LastPresenceTs, updatePresence);

    // If the User object doesn't exist yet, subscribe at client level as a fallback.
    // ExtensionPresence emits ClientEvent.Event after creating and updating the User object,
    // so by the time this fires mx.getUser(userId) is guaranteed to be non-null.
    let removeClientListener: (() => void) | undefined;
    if (!user) {
      const onClientEvent = (event: MatrixEvent) => {
        if (event.getSender() !== userId || event.getType() !== 'm.presence') return;
        const u = mx.getUser(userId);
        if (!u) return;
        setPresence(getUserPresence(u));
      };
      mx.on(ClientEvent.Event, onClientEvent);
      removeClientListener = () => mx.removeListener(ClientEvent.Event, onClientEvent);
    }

    return () => {
      cancelled = true;
      user?.removeListener(UserEvent.Presence, updatePresence);
      user?.removeListener(UserEvent.CurrentlyActive, updatePresence);
      user?.removeListener(UserEvent.LastPresenceTs, updatePresence);
      removeClientListener?.();
    };
  }, [mx, userId, user]);

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
