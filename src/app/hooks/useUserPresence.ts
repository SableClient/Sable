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

// In-memory presence REST cache to avoid N+1 /presence/{userId}/status floods.
// Multiple hook instances for the same user share a single in-flight request.
const PRESENCE_CACHE_TTL_MS = 60_000;
const presenceCache = new Map<string, { data: UserPresence; fetchedAt: number }>();
const presenceInflight = new Map<string, Promise<UserPresence | undefined>>();

/** Visible for testing — clears the in-memory REST presence cache. */
export function clearPresenceCache(): void {
  presenceCache.clear();
  presenceInflight.clear();
}

function fetchPresenceOnce(
  mx: {
    getPresence: (userId: string) => Promise<{
      presence: string;
      status_msg?: string;
      currently_active?: boolean;
      last_active_ago?: number | null;
    }>;
  },
  userId: string
): Promise<UserPresence | undefined> {
  const cached = presenceCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < PRESENCE_CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  const existing = presenceInflight.get(userId);
  if (existing) return existing;

  const promise = mx
    .getPresence(userId)
    .then((resp) => {
      const data: UserPresence = {
        presence: resp.presence as Presence,
        status: resp.status_msg,
        active: resp.currently_active ?? false,
        lastActiveTs: resp.last_active_ago != null ? Date.now() - resp.last_active_ago : undefined,
      };
      presenceCache.set(userId, { data, fetchedAt: Date.now() });
      return data;
    })
    .catch((err: unknown) => {
      // Suppress expected failures (404/403 = presence not supported, network errors).
      // Only log unexpected server errors (5xx) for debugging.
      const status = (err as { httpStatus?: number })?.httpStatus;
      if (status && status >= 500) {
        console.warn('[useUserPresence] REST fetch failed for', userId, err);
      }
      return undefined;
    })
    .finally(() => {
      presenceInflight.delete(userId);
    });

  presenceInflight.set(userId, promise);
  return promise;
}

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
    // Guard against empty userId — callers that render a fixed number of hooks (e.g. group DM
    // slots) pass '' for absent members; firing getPresence('') would be a malformed request.
    if (userId && (!user || user.getLastActiveTs() === 0)) {
      fetchPresenceOnce(mx, userId).then((data) => {
        if (cancelled || !data) return;
        setPresence(data);
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
    if (!user && userId) {
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
      [Presence.Online]: 'Online',
      [Presence.Unavailable]: 'Idle',
      [Presence.Offline]: 'Offline',
    }),
    []
  );
