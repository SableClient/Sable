import { getAppPathFromHref, getSettingsPath, withOriginBaseUrl } from '$pages/pathUtils';
import { isSettingsSectionId, type SettingsSectionId } from './routes';

export type SettingsLink = {
  section: SettingsSectionId;
  focus?: string;
};

export const SETTINGS_LINK_ACTION_PARAM = 'moe.sable.client.action';
export const SETTINGS_LINK_ACTION_SETTINGS = 'settings';

const withSettingsLinkAction = (path: string): string => {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  params.set(SETTINGS_LINK_ACTION_PARAM, SETTINGS_LINK_ACTION_SETTINGS);

  return `${pathname}?${params.toString()}`;
};

const parseSettingsAppPath = (appPath: string): SettingsLink | undefined => {
  if (!appPath.startsWith('/settings/')) return undefined;

  const [pathname, search = ''] = appPath.split('?');
  const sectionMatch = pathname.match(/^\/settings\/([^/]+)\/?$/);
  if (!sectionMatch) return undefined;

  const section = sectionMatch[1];
  if (!isSettingsSectionId(section)) return undefined;

  const focus = new URLSearchParams(search).get('focus') ?? undefined;

  return { section, focus };
};

const hasSettingsLinkAction = (search: string): boolean =>
  new URLSearchParams(search).get(SETTINGS_LINK_ACTION_PARAM) === SETTINGS_LINK_ACTION_SETTINGS;

const getCrossBaseSettingsPathname = (pathname: string): string | undefined =>
  pathname.match(/(\/settings\/[^/]+\/?)$/)?.[1];

const getCrossBaseSettingsAppPath = (pathname: string, search: string): string | undefined => {
  if (!hasSettingsLinkAction(search)) return undefined;

  const settingsPathname = getCrossBaseSettingsPathname(pathname);
  if (!settingsPathname) return undefined;

  const appPath = search ? `${settingsPathname}?${search}` : settingsPathname;
  return parseSettingsAppPath(appPath) ? appPath : undefined;
};

const getSameBaseSettingsAppPath = (baseUrl: string, href: string): string | undefined => {
  const base = new URL(baseUrl);
  const target = new URL(href);

  if (base.origin !== target.origin) return undefined;

  if (base.hash) {
    const baseHash = base.hash.replace(/\/+$/, '');
    if (!(target.hash === baseHash || target.hash.startsWith(`${baseHash}/`))) {
      return undefined;
    }
  }

  return getAppPathFromHref(baseUrl, href);
};

const getCrossBaseSettingsAppPathFromHref = (href: string): string | undefined => {
  const target = new URL(href);

  const directAppPath = getCrossBaseSettingsAppPath(
    target.pathname,
    target.search.replace(/^\?/, '')
  );
  if (directAppPath) {
    return directAppPath;
  }

  const hashPath = target.hash.startsWith('#') ? target.hash.slice(1) : target.hash;
  if (!hashPath) return undefined;

  const [hashPathname, hashSearch = ''] = hashPath.split('?');
  return getCrossBaseSettingsAppPath(hashPathname, hashSearch);
};

export const buildSettingsLink = (
  baseUrl: string,
  section: SettingsSectionId,
  focus?: string
): string => withOriginBaseUrl(baseUrl, withSettingsLinkAction(getSettingsPath(section, focus)));

export const parseSettingsLink = (baseUrl: string, href: string): SettingsLink | undefined => {
  try {
    const sameBaseAppPath = getSameBaseSettingsAppPath(baseUrl, href);
    if (sameBaseAppPath) {
      return parseSettingsAppPath(sameBaseAppPath);
    }

    const crossBaseAppPath = getCrossBaseSettingsAppPathFromHref(href);
    if (crossBaseAppPath) {
      return parseSettingsAppPath(crossBaseAppPath);
    }

    return undefined;
  } catch {
    return undefined;
  }
};

export const toSettingsFocusIdPart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
