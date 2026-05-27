import { useEffect, useMemo, useState } from 'react';
import type { MatrixEvent, User, UserEventHandlerMap } from '$types/matrix-sdk';
import { ClientEvent, UserEvent } from '$types/matrix-sdk';
import { useMatrixClient } from './useMatrixClient';

export enum Presence {
  Online = 'online',
  Unavailable = 'unavailable',
  Offline = 'offline',
  // DND is not a native Matrix state; Sable encodes it as online + status_msg='dnd'.
  Dnd = 'dnd',
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

      // When the user isn't in the SDK store yet (e.g., presence arrived before
      // any membership event), listen on the client for incoming events so we
      // can re-evaluate once a presence event for this user is stored.
      const handleEvent = (event: MatrixEvent) => {
        if (event.getType() !== 'm.presence') return;
        // MSC4186 sliding sync presence events may carry the user ID in
        // content.user_id rather than the sender field.
        const sender = event.getSender() ?? (event.getContent().user_id as string | undefined);
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

    // Synapse's MSC4186 simplified sliding sync has no presence extension, so
    // presence events never arrive over the sync stream.  If lastPresenceTs is
    // still 0 we have never received presence data for this user — fall back to
    // a direct REST call so badges appear on first render.
    if (user.lastPresenceTs === 0) {
      mx.getPresence(userId)
        .then((status) => {
          user.presence = status.presence;
          user.presenceStatusMsg = status.status_msg;
          user.currentlyActive = status.currently_active ?? false;
          user.lastActiveAgo = status.last_active_ago ?? 0;
          user.lastPresenceTs = Date.now();
          setPresence(getUserPresence(user));
        })
        .catch(() => {
          // Presence unavailable or disabled on this server — stay offline.
        });
    }

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
      [Presence.Dnd]: 'Do Not Disturb',
    }),
    []
  );
