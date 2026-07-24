import type { ReactNode } from 'react';
import { memo, useEffect, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { makeClosedNavCategoriesAtom } from '$state/closedNavCategories';
import { ClosedNavCategoriesProvider } from '$state/hooks/closedNavCategories';
import { makeClosedLobbyCategoriesAtom } from '$state/closedLobbyCategories';
import { ClosedLobbyCategoriesProvider } from '$state/hooks/closedLobbyCategories';
import { makeNavToActivePathAtom } from '$state/navToActivePath';
import { NavToActivePathProvider } from '$state/hooks/navToActivePath';
import { makeOpenedSidebarFolderAtom } from '$state/openedSidebarFolder';
import { OpenedSidebarFolderProvider } from '$state/hooks/openedSidebarFolder';
import { makeCallPreferencesAtom } from '$state/callPreferences';
import { CallPreferencesProvider } from '$state/hooks/callPreferences';
import { useSyncAnimalKind } from '$state/useSyncAnimalKind';
import { persistentProfileIdsAtom, profilesCacheAtom } from '$state/userRoomProfile';
import { readCachedUserProfiles, writeCachedUserProfiles } from '$client/userProfileCache';

const PROFILE_CACHE_WRITE_DELAY_MS = 1000;

type ProfileCacheHydratorProps = {
  accountUserId: string;
  profiles: ReturnType<typeof readCachedUserProfiles>;
};

const ProfileCacheHydrator = memo(({ accountUserId, profiles }: ProfileCacheHydratorProps) => {
  const persistentIds = new Set([...Object.keys(profiles), accountUserId]);
  // The outer Jotai store survives account switches, so replace the previous account's profiles.
  // memo keeps this forced hydration from running again during ordinary profile updates.
  useHydrateAtoms(
    [
      [profilesCacheAtom, profiles],
      [persistentProfileIdsAtom, persistentIds],
    ],
    { dangerouslyForceHydrate: true }
  );
  return null;
});

type ProfileCachePersistenceProps = {
  accountUserId: string;
};

const ProfileCachePersistence = ({ accountUserId }: ProfileCachePersistenceProps) => {
  const profiles = useAtomValue(profilesCacheAtom);
  const persistentProfileIds = useAtomValue(persistentProfileIdsAtom);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const persistentProfiles: typeof profiles = {};
      persistentProfileIds.forEach((userId) => {
        const profile = profiles[userId];
        if (profile) persistentProfiles[userId] = profile;
      });
      writeCachedUserProfiles(accountUserId, persistentProfiles);
    }, PROFILE_CACHE_WRITE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [accountUserId, persistentProfileIds, profiles]);

  return null;
};

type ClientInitStorageAtomProps = {
  children: ReactNode;
};
export function ClientInitStorageAtom({ children }: ClientInitStorageAtomProps) {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const cachedProfiles = useMemo(() => readCachedUserProfiles(userId), [userId]);

  // could probably be put somewhere else, doesnt affect the execution time of the program here :shrug:
  useSyncAnimalKind(userId);

  const closedNavCategoriesAtom = useMemo(() => makeClosedNavCategoriesAtom(userId), [userId]);

  const closedLobbyCategoriesAtom = useMemo(() => makeClosedLobbyCategoriesAtom(userId), [userId]);

  const navToActivePathAtom = useMemo(() => makeNavToActivePathAtom(userId), [userId]);

  const openedSidebarFolderAtom = useMemo(() => makeOpenedSidebarFolderAtom(userId), [userId]);

  const callPreferencesAtom = useMemo(() => makeCallPreferencesAtom(userId), [userId]);

  return (
    <>
      <ProfileCacheHydrator key={userId} accountUserId={userId} profiles={cachedProfiles} />
      <ProfileCachePersistence accountUserId={userId} />
      <ClosedNavCategoriesProvider value={closedNavCategoriesAtom}>
        <ClosedLobbyCategoriesProvider value={closedLobbyCategoriesAtom}>
          <NavToActivePathProvider value={navToActivePathAtom}>
            <OpenedSidebarFolderProvider value={openedSidebarFolderAtom}>
              <CallPreferencesProvider value={callPreferencesAtom}>
                {children}
              </CallPreferencesProvider>
            </OpenedSidebarFolderProvider>
          </NavToActivePathProvider>
        </ClosedLobbyCategoriesProvider>
      </ClosedNavCategoriesProvider>
    </>
  );
}
