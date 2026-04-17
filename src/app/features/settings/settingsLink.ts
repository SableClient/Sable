import type { ClientConfig } from '$hooks/useClientConfig';
import { getAppPathFromHref, getSettingsPath, withOriginBaseUrl } from '$pages/pathUtils';
import { isSettingsSectionId, type SettingsSectionId } from './routes';

export type SettingsLink = {
  section: SettingsSectionId;
  focus?: string;
};

export const DEFAULT_SETTINGS_LINK_BASE_URL = 'https://app.sable.moe';

export const normalizeSettingsLinkBaseUrl = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
};

export const getConfiguredSettingsLinkBaseUrl = (
  clientConfig: Pick<ClientConfig, 'settingsLinkBaseUrl'>
): string =>
  normalizeSettingsLinkBaseUrl(clientConfig.settingsLinkBaseUrl) ?? DEFAULT_SETTINGS_LINK_BASE_URL;

export const getEffectiveSettingsLinkBaseUrl = (
  clientConfig: Pick<ClientConfig, 'settingsLinkBaseUrl'>,
  override?: string
): string =>
  normalizeSettingsLinkBaseUrl(override) ?? getConfiguredSettingsLinkBaseUrl(clientConfig);

export const buildSettingsLink = (
  baseUrl: string,
  section: SettingsSectionId,
  focus?: string
): string => withOriginBaseUrl(baseUrl, getSettingsPath(section, focus));

export const parseSettingsLink = (baseUrl: string, href: string): SettingsLink | undefined => {
  try {
    const base = new URL(baseUrl);
    const target = new URL(href);

    if (base.origin !== target.origin) return undefined;

    if (base.hash) {
      const baseHash = base.hash.replace(/\/+$/, '');
      if (!(target.hash === baseHash || target.hash.startsWith(`${baseHash}/`))) {
        return undefined;
      }
    }

    const appPath = getAppPathFromHref(baseUrl, href);
    if (!appPath.startsWith('/settings/')) return undefined;

    const [pathname = '', search = ''] = appPath.split('?');
    const sectionMatch = pathname.match(/^\/settings\/([^/]+)\/?$/);
    if (!sectionMatch) return undefined;

    const section = sectionMatch[1];
    if (!isSettingsSectionId(section)) return undefined;

    const focus = new URLSearchParams(search).get('focus') ?? undefined;

    return { section, focus };
  } catch {
    return undefined;
  }
};

export const toSettingsFocusIdPart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
