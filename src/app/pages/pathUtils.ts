import type { Path } from 'react-router';
import { generatePath, matchPath } from 'react-router';
import { trimLeadingSlash, trimTrailingSlash } from '$utils/common';
import { getAppOrigin } from '$utils/platform';
import type { HashRouterConfig } from '$hooks/useClientConfig';
import type { SettingsPathSearchParams } from './paths';
import {
  DIRECT_CREATE_PATH,
  DIRECT_PATH,
  DIRECT_ROOM_PATH,
  EXPLORE_FEATURED_PATH,
  EXPLORE_PATH,
  EXPLORE_SERVER_PATH,
  HOME_JOIN_PATH,
  HOME_PATH,
  HOME_ROOM_PATH,
  HOME_SEARCH_PATH,
  LOGIN_PATH,
  INBOX_INVITES_PATH,
  INBOX_NOTIFICATIONS_PATH,
  INBOX_PATH,
  REGISTER_PATH,
  RESET_PASSWORD_PATH,
  SERVER_SEARCH_PARAM,
  SETTINGS_PATH,
  SPACE_LOBBY_PATH,
  SPACE_PATH,
  SPACE_ROOM_PATH,
  SPACE_SEARCH_PATH,
  CREATE_PATH,
  CREATE_ROOM_PATH,
  BUG_REPORT_PATH,
  NAVIGATE_PATH,
  PROFILE_PATH,
  INBOX_BOOKMARKS_PATH,
  HOME_ROOM_FORUM_PATH,
  DIRECT_ROOM_FORUM_PATH,
  SPACE_ROOM_FORUM_PATH,
} from './paths';

export const joinPathComponent = (path: Path): string => path.pathname + path.search + path.hash;

const generateEncodedPath = (path: string, params: Record<string, string | null>): string =>
  generatePath(
    path,
    Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        value === null ? null : encodeURIComponent(value),
      ])
    )
  ).replaceAll('%25', '%');

export const withSearchParam = (path: string, searchParam: Record<string, string>): string => {
  const [pathname, existingSearch] = path.split('?');
  const params = new URLSearchParams(existingSearch);
  Object.entries(searchParam).forEach(([name, value]) => params.set(name, value));

  return `${pathname}?${params}`;
};
export const encodeSearchParamValueArray = (ids: string[]): string => ids.join(',');
export const decodeSearchParamValueArray = (idsParam: string): string[] => idsParam.split(',');

export const getOriginBaseUrl = (hashRouterConfig?: HashRouterConfig): string => {
  const baseUrl = `${trimTrailingSlash(getAppOrigin())}${import.meta.env.BASE_URL}`;

  if (hashRouterConfig?.enabled) {
    return `${trimTrailingSlash(baseUrl)}/#${hashRouterConfig.basename}`;
  }

  return baseUrl;
};

export const withOriginBaseUrl = (baseUrl: string, path: string): string =>
  `${trimTrailingSlash(baseUrl)}${path}`;

export const getAppPathFromHref = (baseUrl: string, href: string): string => {
  // if hash is in baseUrl means we are using hashRouter
  const baseHashIndex = baseUrl.indexOf('#');
  if (baseHashIndex > -1) {
    const hrefHashIndex = href.indexOf('#');
    if (hrefHashIndex === -1) return '';

    // href may/not have "/" around "#"
    // we need to take care of this when extracting app path
    const trimmedBaseUrl = trimLeadingSlash(baseUrl.slice(baseHashIndex + 1));
    const trimmedHref = trimLeadingSlash(href.slice(hrefHashIndex + 1));

    const appPath = trimmedHref.startsWith(trimmedBaseUrl)
      ? trimmedHref.slice(trimmedBaseUrl.length)
      : '';
    return `/${trimLeadingSlash(appPath)}`;
  }

  const trimmedBaseUrl = trimTrailingSlash(baseUrl);
  if (href.startsWith(trimmedBaseUrl)) return href.slice(trimmedBaseUrl.length);
  const { pathname, search } = new URL(href);
  return pathname + search;
};

// The homeserver rides in the query string: as a path segment a server given as a full URL
// ("http://localhost:8008") needs an escaped slash, which hosting layers normalise away.
const withServerParam = (path: string, server?: string): string =>
  server ? withSearchParam(path, { [SERVER_SEARCH_PARAM]: server }) : path;

export const getLoginPath = (server?: string): string => withServerParam(LOGIN_PATH, server);

export const getRegisterPath = (server?: string): string => withServerParam(REGISTER_PATH, server);

export const getResetPasswordPath = (server?: string): string =>
  withServerParam(RESET_PASSWORD_PATH, server);

export const getHomePath = (): string => HOME_PATH;
export const getHomeJoinPath = (): string => HOME_JOIN_PATH;
export const getHomeSearchPath = (): string => HOME_SEARCH_PATH;
export const getHomeRoomPath = (roomIdOrAlias: string, eventId?: string): string => {
  const params = {
    roomIdOrAlias,
    eventId: eventId ?? null,
  };

  return generateEncodedPath(HOME_ROOM_PATH, params);
};

export const getHomeForumPath = (roomIdOrAlias: string, eventId?: string): string =>
  generateEncodedPath(HOME_ROOM_FORUM_PATH, { roomIdOrAlias, eventId: eventId ?? null });

export const getDirectPath = (): string => DIRECT_PATH;
export const getDirectCreatePath = (): string => DIRECT_CREATE_PATH;
export const getDirectRoomPath = (roomIdOrAlias: string, eventId?: string): string => {
  const params = {
    roomIdOrAlias,
    eventId: eventId ?? null,
  };

  return generateEncodedPath(DIRECT_ROOM_PATH, params);
};

export const getDirectForumPath = (roomIdOrAlias: string, eventId?: string): string =>
  generateEncodedPath(DIRECT_ROOM_FORUM_PATH, { roomIdOrAlias, eventId: eventId ?? null });

export const getSpacePath = (spaceIdOrAlias: string): string => {
  const params = {
    spaceIdOrAlias,
  };

  return generateEncodedPath(SPACE_PATH, params);
};
export const getSpaceLobbyPath = (spaceIdOrAlias: string): string => {
  const params = {
    spaceIdOrAlias,
  };
  return generateEncodedPath(SPACE_LOBBY_PATH, params);
};
export const getSpaceSearchPath = (spaceIdOrAlias: string): string => {
  const params = {
    spaceIdOrAlias,
  };
  return generateEncodedPath(SPACE_SEARCH_PATH, params);
};
export const getSpaceRoomPath = (
  spaceIdOrAlias: string,
  roomIdOrAlias: string,
  eventId?: string
): string => {
  const params = {
    spaceIdOrAlias,
    roomIdOrAlias,
    eventId: eventId ?? null,
  };

  return generateEncodedPath(SPACE_ROOM_PATH, params);
};
export const getSpaceForumPath = (
  spaceIdOrAlias: string,
  roomIdOrAlias: string,
  eventId?: string
): string =>
  generateEncodedPath(SPACE_ROOM_FORUM_PATH, {
    spaceIdOrAlias,
    roomIdOrAlias,
    eventId: eventId ?? null,
  });

export const getExplorePath = (): string => EXPLORE_PATH;
export const getExploreFeaturedPath = (): string => EXPLORE_FEATURED_PATH;
export const getExploreServerPath = (server: string): string => {
  const params = {
    server,
  };
  return generateEncodedPath(EXPLORE_SERVER_PATH, params);
};

export const getCreatePath = (): string => CREATE_PATH;
export const getCreateSpacePath = (spaceId?: string): string =>
  spaceId ? withSearchParam(CREATE_PATH, { spaceId }) : CREATE_PATH;
export const getCreateRoomPath = (spaceId?: string, type?: string): string => {
  const params: Record<string, string> = {};
  if (spaceId) params.spaceId = spaceId;
  if (type) params.type = type;

  return Object.keys(params).length ? withSearchParam(CREATE_ROOM_PATH, params) : CREATE_ROOM_PATH;
};
export const getBugReportPath = (): string => BUG_REPORT_PATH;
export const getNavigatePath = (): string => NAVIGATE_PATH;
export const getProfilePath = (): string => PROFILE_PATH;

export const getInboxPath = (): string => INBOX_PATH;
export const getInboxNotificationsPath = (): string => INBOX_NOTIFICATIONS_PATH;
export const getInboxInvitesPath = (): string => INBOX_INVITES_PATH;
export const getInboxBookmarksPath = (): string => INBOX_BOOKMARKS_PATH;

export type SectionNav = {
  /** Stable key identifying the section, used to scope the last-visited room. */
  key: string;
  /** Path to the section's bare list route. */
  listPath: string;
  /** Builds the path to a room within this section, or null when the section has no rooms. */
  getRoomPath: ((roomIdOrAlias: string) => string) | null;
  /** Decoded space id or alias, present only when the section is a space. */
  spaceIdOrAlias?: string;
};

/**
 * Resolves the navigable section for a pathname. `SPACE_PATH` is a catch-all first
 * segment, so the literal sections (home, direct, explore, inbox) must be matched
 * before falling back to a space. Returns null for unmatched paths.
 */
export const resolveSection = (pathname: string): SectionNav | null => {
  if (matchPath({ path: HOME_PATH, end: false }, pathname)) {
    const isForum = matchPath({ path: HOME_ROOM_FORUM_PATH, end: false }, pathname) !== null;
    return {
      key: 'home',
      listPath: getHomePath(),
      getRoomPath: isForum ? getHomeForumPath : getHomeRoomPath,
    };
  }
  if (matchPath({ path: DIRECT_PATH, end: false }, pathname)) {
    const isForum = matchPath({ path: DIRECT_ROOM_FORUM_PATH, end: false }, pathname) !== null;
    return {
      key: 'direct',
      listPath: getDirectPath(),
      getRoomPath: isForum ? getDirectForumPath : getDirectRoomPath,
    };
  }
  if (matchPath({ path: EXPLORE_PATH, end: false }, pathname)) {
    return { key: 'explore', listPath: getExplorePath(), getRoomPath: null };
  }
  if (matchPath({ path: INBOX_PATH, end: false }, pathname)) {
    return { key: 'inbox', listPath: getInboxPath(), getRoomPath: null };
  }
  const spaceMatch = matchPath({ path: SPACE_PATH, end: false }, pathname);
  const encodedSpaceId = spaceMatch?.params.spaceIdOrAlias;
  if (encodedSpaceId) {
    const spaceId = decodeURIComponent(encodedSpaceId);
    const isForum = matchPath({ path: SPACE_ROOM_FORUM_PATH, end: false }, pathname) !== null;
    return {
      key: `space:${spaceId}`,
      listPath: getSpacePath(spaceId),
      getRoomPath: isForum
        ? (roomIdOrAlias) => getSpaceForumPath(spaceId, roomIdOrAlias)
        : (roomIdOrAlias) => getSpaceRoomPath(spaceId, roomIdOrAlias),
      spaceIdOrAlias: spaceId,
    };
  }
  return null;
};

const ROOM_ID_OR_ALIAS_PATH_PATTERNS = [
  HOME_ROOM_PATH,
  HOME_ROOM_FORUM_PATH,
  DIRECT_ROOM_PATH,
  DIRECT_ROOM_FORUM_PATH,
  SPACE_ROOM_PATH,
  SPACE_ROOM_FORUM_PATH,
];

/**
 * Extracts the room id/alias segment straight from a pathname, independent of any
 * navigation history. Route components normally get this via `useParams`, but that
 * requires being mounted inside the matched route element — callers mounted above
 * the router (e.g. app-wide feature components) need to match the pathname directly.
 */
export const matchRoomIdOrAlias = (pathname: string): string | undefined => {
  for (const pattern of ROOM_ID_OR_ALIAS_PATH_PATTERNS) {
    const encoded = matchPath({ path: pattern, end: false }, pathname)?.params.roomIdOrAlias;
    if (encoded) return decodeURIComponent(encoded);
  }
  return undefined;
};

export const getSettingsPath = (section?: string, focus?: string): string => {
  const path = trimTrailingSlash(generatePath(SETTINGS_PATH, { section: section ?? null }));
  if (!focus) return path;

  const params: SettingsPathSearchParams = { focus };
  return `${path}?${new URLSearchParams(params).toString()}`;
};
