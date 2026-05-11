import type { ReactNode } from 'react';
import { atom } from 'jotai';
import { createLogger } from '$utils/debug';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

const log = createLogger('sessions');

export type Session = {
  baseUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
  expiresInMs?: number;
  refreshToken?: string;
  fallbackSdkStores?: boolean;
  slidingSyncOptIn?: boolean;
};

export type Sessions = Session[];
export type SessionStoreName = {
  sync: string;
  crypto: string;
  /** Prefix for the Rust crypto IndexedDB: the actual DB is `${rustCryptoPrefix}::matrix-sdk-crypto` */
  rustCryptoPrefix: string;
};

/**
 * Migration code for old session
 */
const FALLBACK_STORE_NAME: SessionStoreName = {
  sync: 'web-sync-store',
  crypto: 'crypto-store',
  rustCryptoPrefix: 'matrix-js-sdk',
} as const;

export function setFallbackSession(
  accessToken: string,
  deviceId: string,
  userId: string,
  baseUrl: string
) {
  localStorage.setItem('cinny_access_token', accessToken);
  localStorage.setItem('cinny_device_id', deviceId);
  localStorage.setItem('cinny_user_id', userId);
  localStorage.setItem('cinny_hs_base_url', baseUrl);
}
export const removeFallbackSession = () => {
  localStorage.removeItem('cinny_hs_base_url');
  localStorage.removeItem('cinny_user_id');
  localStorage.removeItem('cinny_device_id');
  localStorage.removeItem('cinny_access_token');
};
export const getFallbackSession = (): Session | undefined => {
  const baseUrl = localStorage.getItem('cinny_hs_base_url');
  const userId = localStorage.getItem('cinny_user_id');
  const deviceId = localStorage.getItem('cinny_device_id');
  const accessToken = localStorage.getItem('cinny_access_token');

  if (baseUrl && userId && deviceId && accessToken) {
    return {
      baseUrl,
      userId,
      deviceId,
      accessToken,
      fallbackSdkStores: true,
    };
  }

  return undefined;
};
/**
 * End of migration code for old session
 */

export const getSessionStoreName = (session: Session): SessionStoreName => {
  if (session.fallbackSdkStores) {
    return FALLBACK_STORE_NAME;
  }

  return {
    sync: `sync${session.userId}`,
    crypto: `crypto${session.userId}`,
    rustCryptoPrefix: `sync${session.userId}`,
  };
};

export const MATRIX_SESSIONS_KEY = 'matrixSessions';
const baseSessionsAtom = atomWithLocalStorage<Sessions>(
  MATRIX_SESSIONS_KEY,
  (key) => {
    const defaultSessions: Sessions = [];
    const sessions = getLocalStorageItem(key, defaultSessions);

    // Before multi account support session was stored
    // as multiple item in local storage.
    // So we need these migration code.
    const fallbackSession = getFallbackSession();
    if (fallbackSession) {
      removeFallbackSession();
      sessions.push(fallbackSession);
      setLocalStorageItem(key, sessions);
    }
    return sessions;
  },
  (key, value) => {
    setLocalStorageItem(key, value);
  }
);

export type SessionsAction =
  | {
      type: 'PUT';
      session: Session;
    }
  | {
      type: 'DELETE';
      session: Session;
    };

export const sessionsAtom = atom<Sessions, [SessionsAction], void>(
  (get) => get(baseSessionsAtom),
  (get, set, action) => {
    if (action.type === 'PUT') {
      const sessions = [...get(baseSessionsAtom)];
      const sessionIndex = sessions.findIndex(
        (session) => session.userId === action.session.userId
      );
      if (sessionIndex === -1) {
        log.log('PUT new session', action.session.userId);
        sessions.push(action.session);
      } else {
        log.log('PUT update session', action.session.userId);
        sessions.splice(sessionIndex, 1, action.session);
      }
      set(baseSessionsAtom, sessions);
      return;
    }
    if (action.type === 'DELETE') {
      log.log('DELETE session', action.session.userId);
      const sessions = get(baseSessionsAtom).filter(
        (session) => session.userId !== action.session.userId
      );
      set(baseSessionsAtom, sessions);
    }
  }
);

export const ACTIVE_SESSION_KEY = 'matrixActiveSession';
const baseActiveSessionAtom = atomWithLocalStorage<string | undefined>(
  ACTIVE_SESSION_KEY,
  (key) => getLocalStorageItem<string | undefined>(key, undefined),
  (key, value) => setLocalStorageItem(key, value)
);

/** Stores the userId of the currently active session. */
export const activeSessionIdAtom = atom<string | undefined, [string | undefined], void>(
  (get) => get(baseActiveSessionAtom),
  (_get, set, value) => {
    set(baseActiveSessionAtom, value);
  }
);

export type PendingNotification = {
  roomId: string;
  eventId?: string;
  targetSessionId?: string;
};

export const pendingNotificationAtom = atom<PendingNotification | null>(null);

// ─── In-app notification banner ────────────────────────────────────────────

export type InAppBannerNotification = {
  /** Unique id; used to deduplicate rapid-fire events. */
  id: string;
  /** Primary title line – kept for backwards-compat (background accounts). */
  title: string;
  /** Room display name (used as the #channel part of the subtitle). */
  roomName?: string;
  /** Homeserver extracted from the canonical alias or room ID (e.g. matrix.org). */
  serverName?: string;
  /** Display name of the sender. */
  senderName?: string;
  body?: string;
  /**
   * Pre-rendered rich body with mxc/mention transforms (built in ClientNonUIFeatures).
   * When present, takes precedence over the plain-text `body` fallback.
   */
  bodyNode?: ReactNode;
  /** URL of an avatar or room icon to display inside the banner. */
  icon?: string;
  onClick: () => void;
};

export const inAppBannerAtom = atom<InAppBannerNotification | null>(null);

// ─── Per-background-account unread counts ──────────────────────────────────

export type BackgroundUnread = {
  total: number;
  highlight: number;
};

/**
 * Keyed by userId.  Counts accumulate while a session is in the background
 * and are cleared when the user switches to that account.
 */
export const backgroundUnreadCountsAtom = atom<Record<string, BackgroundUnread>>({});
