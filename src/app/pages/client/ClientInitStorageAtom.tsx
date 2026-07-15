import type { ReactNode } from 'react';
import { useMemo } from 'react';
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

type ClientInitStorageAtomProps = {
  children: ReactNode;
};
export function ClientInitStorageAtom({ children }: ClientInitStorageAtomProps) {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;

  // could probably be put somewhere else, doesnt affect the execution time of the program here :shrug:
  useSyncAnimalKind(userId);

  const closedNavCategoriesAtom = useMemo(() => makeClosedNavCategoriesAtom(userId), [userId]);

  const closedLobbyCategoriesAtom = useMemo(() => makeClosedLobbyCategoriesAtom(userId), [userId]);

  const navToActivePathAtom = useMemo(() => makeNavToActivePathAtom(userId), [userId]);

  const openedSidebarFolderAtom = useMemo(() => makeOpenedSidebarFolderAtom(userId), [userId]);

  const callPreferencesAtom = useMemo(() => makeCallPreferencesAtom(userId), [userId]);

  return (
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
  );
}
