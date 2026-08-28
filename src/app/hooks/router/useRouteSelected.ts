import { useMatch, useParams } from 'react-router';
import {
  getCreatePath,
  getDirectCreatePath,
  getDirectPath,
  getExploreFeaturedPath,
  getExplorePath,
  getHomePath,
  getHomeSearchPath,
  getInboxBookmarksPath,
  getInboxInvitesPath,
  getInboxNotificationsPath,
  getInboxPath,
  getNavigatePath,
  getProfilePath,
} from '$pages/pathUtils';
import { CREATE_ROOM_PATH } from '$pages/paths';

/** True when the current location is at, or inside, the given path. */
export const useRouteSelected = (path: string): boolean =>
  !!useMatch({ path, caseSensitive: true, end: false });

export const useCreateSelected = (): boolean => useRouteSelected(getCreatePath());

export const useDirectSelected = (): boolean => useRouteSelected(getDirectPath());
export const useDirectCreateSelected = (): boolean => useRouteSelected(getDirectCreatePath());

export const useExploreSelected = (): boolean => useRouteSelected(getExplorePath());
export const useExploreFeaturedSelected = (): boolean => useRouteSelected(getExploreFeaturedPath());
export const useExploreServer = (): string | undefined => useParams().server;

export const useHomeSelected = (): boolean => useRouteSelected(getHomePath());
export const useHomeCreateSelected = (): boolean => useRouteSelected(CREATE_ROOM_PATH);
export const useHomeSearchSelected = (): boolean => useRouteSelected(getHomeSearchPath());

export const useInboxSelected = (): boolean => useRouteSelected(getInboxPath());
export const useInboxNotificationsSelected = (): boolean =>
  useRouteSelected(getInboxNotificationsPath());
export const useInboxInvitesSelected = (): boolean => useRouteSelected(getInboxInvitesPath());
export const useInboxBookmarksSelected = (): boolean => useRouteSelected(getInboxBookmarksPath());

export const useNavigateSelected = (): boolean => useRouteSelected(getNavigatePath());

export const useProfileSelected = (): boolean => useRouteSelected(getProfilePath());
