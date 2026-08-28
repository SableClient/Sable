import type { UserProfile } from '$hooks/useUserProfile';

const CACHE_VERSION = 3;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const PROFILE_CACHE_FRESH_MS = 10 * 60 * 1000;
const MAX_CACHED_PROFILES = 1000;
const MAX_SERIALIZED_LENGTH = 1_500_000;
const CACHE_KEY_PREFIX = 'sable.userProfiles.v3.';
const LEGACY_CACHE_KEY_PREFIXES = ['sable.userProfiles.v2.', 'sable.userProfiles.v1.'];

type PersistedProfileCache = {
  version: number;
  savedAt: number;
  profiles: Array<[string, UserProfile]>;
};

const cacheKey = (accountUserId: string): string =>
  `${CACHE_KEY_PREFIX}${encodeURIComponent(accountUserId)}`;
const legacyCacheKeys = (accountUserId: string): string[] =>
  LEGACY_CACHE_KEY_PREFIXES.map((prefix) => `${prefix}${encodeURIComponent(accountUserId)}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readCachedUserProfiles = (
  accountUserId: string,
  now = Date.now()
): Record<string, UserProfile> => {
  try {
    legacyCacheKeys(accountUserId).forEach((key) => globalThis.localStorage?.removeItem(key));
    const raw = globalThis.localStorage?.getItem(cacheKey(accountUserId));
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Partial<PersistedProfileCache>;
    if (
      parsed.version !== CACHE_VERSION ||
      typeof parsed.savedAt !== 'number' ||
      now - parsed.savedAt > CACHE_MAX_AGE_MS ||
      !Array.isArray(parsed.profiles)
    ) {
      return {};
    }

    const profiles: Record<string, UserProfile> = {};
    parsed.profiles.slice(-MAX_CACHED_PROFILES).forEach((entry) => {
      if (!Array.isArray(entry) || entry.length !== 2) return;
      const [userId, profile] = entry;
      if (typeof userId !== 'string' || !isRecord(profile)) return;
      const typedProfile = profile as UserProfile;
      const fetchedAt = typedProfile._fetchedAt;
      const isFresh =
        typeof fetchedAt === 'number' &&
        Number.isFinite(fetchedAt) &&
        now - fetchedAt < PROFILE_CACHE_FRESH_MS;
      profiles[userId] = { ...typedProfile, _fetched: isFresh };
    });
    return profiles;
  } catch {
    return {};
  }
};

export const writeCachedUserProfiles = (
  accountUserId: string,
  profiles: Record<string, UserProfile>,
  now = Date.now()
): void => {
  try {
    let entries = Object.entries(profiles)
      .filter(([, profile]) =>
        Object.keys(profile).some((key) => key !== '_fetched' && key !== '_fetchedAt')
      )
      .slice(-MAX_CACHED_PROFILES)
      .map(([userId, profile]) => {
        const { _fetched: _ignored, ...persistedProfile } = profile;
        return [userId, persistedProfile] as [string, UserProfile];
      });

    let serialized = JSON.stringify({ version: CACHE_VERSION, savedAt: now, profiles: entries });
    while (serialized.length > MAX_SERIALIZED_LENGTH && entries.length > 0) {
      entries = entries.slice(Math.max(1, Math.ceil(entries.length / 10)));
      serialized = JSON.stringify({ version: CACHE_VERSION, savedAt: now, profiles: entries });
    }

    globalThis.localStorage?.setItem(cacheKey(accountUserId), serialized);
  } catch {
    // Storage may be unavailable or full. Profiles will simply load from the network next time.
  }
};

export const clearCachedUserProfiles = (accountUserId: string): void => {
  try {
    [cacheKey(accountUserId), ...legacyCacheKeys(accountUserId)].forEach((key) =>
      globalThis.localStorage?.removeItem(key)
    );
  } catch {
    // logout and cache recovery continue if storage is unavailable.
  }
};
