import { getAppPathFromHref, getSettingsPath, withOriginBaseUrl } from '$pages/pathUtils';
import { isSettingsSectionId, settingsSections, type SettingsSectionId } from './routes';

export type SettingsLink = {
  section: SettingsSectionId;
  focus?: string;
};

export const SETTINGS_LINK_ACTION_PARAM = 'moe.sable.client.action';
export const SETTINGS_LINK_ACTION_SETTINGS = 'settings';
const SETTINGS_FOCUS_ID_PATTERN = /^[a-z0-9-]+$/;
const SETTINGS_LINK_FORBIDDEN_QUERY_VALUE_PATTERN = /["<>]/;

const settingsSectionLabel = Object.fromEntries(
  settingsSections.map((section) => [section.id, section.label])
) as Record<SettingsSectionId, string>;

const settingsLinkFocusIdsBySection: Record<SettingsSectionId, readonly string[]> = {
  general: [
    'client-side-embeds',
    'composer-formatting-toolbar',
    'custom-date-format',
    'date-format',
    'disable-media-auto-load',
    'display-bundled-embeds',
    'display-multiple-embeds',
    'embed-youtube-links',
    'emoji-selector-threshold',
    'enable-swiping',
    'encrypted-room-embeds',
    'encrypted-room-url-preview',
    'enter-for-newline',
    'error-reporting',
    'file-description-placement',
    'hide-member-events-read-only-rooms',
    'hide-membership-change',
    'hide-profile-change',
    'hide-read-receipts',
    'hide-typing-indicators',
    'large-room-call-button',
    'markdown-formatting',
    'message-layout',
    'message-spacing',
    'presence-status',
    'reply-notifications',
    'right-aligned-bubbles',
    'right-swipe-action',
    'session-replay',
    'show-hidden-events',
    'show-redacted-message-tombstones',
    'sync-across-devices',
    'sync-status',
    'twenty-four-hour-time-format',
    'url-preview',
    'use-sliding-sync',
    'join-on-click-voicecalls',
  ],
  account: [
    'about-you',
    'avatar',
    'banner',
    'blocked-users',
    'display-name',
    'email-address',
    'has-cats',
    'is-cat',
    'user-hero-color',
    'matrix-id',
    'name-color',
    'name-color-dark-theme',
    'name-color-light-theme',
    'pronouns',
    'render-animals',
    'status',
    'timezone',
  ],
  persona: ['enable-pk-commands', 'enable-pk-shorthands'],
  appearance: [
    'autoplay-emojis',
    'autoplay-gifs',
    'autoplay-stickers',
    'blur-avatars',
    'blur-emotes',
    'blur-media',
    'code-block-dark-theme',
    'code-block-light-theme',
    'code-block-manual-theme',
    'code-block-system-theme',
    'collapse-folders-by-default',
    'colorful-names',
    'consistent-icon-style',
    'browse-remote-catalog',
    'customize-dm-cards',
    'custom-profile-cards',
    'dark-theme',
    'display-room-banners',
    'jumbo-emoji-size',
    'light-theme',
    'manual-theme',
    'message-link-preview',
    'page-zoom',
    'catalog-themes',
    'catalog-tweaks',
    'theme-browse-remote',
    'theme-catalog-clear-remote',
    'theme-chat-sable-widgets',
    'theme-chat-auto-approved',
    'theme-chat-auto-any',
    'theme-import-open',
    'theme-local-sync-system',
    'pronoun-pills-for-all',
    'reduced-motion',
    'render-global-username-colors',
    'render-space-room-fonts',
    'render-space-room-username-colors',
    'saturation',
    'selected-language-for-pronouns',
    'show-easter-eggs',
    'show-pronoun-pills',
    'show-pronouns-only-in-selected-language',
    'subspace-hierarchy-limit',
    'system-theme',
    'twitter-emoji',
    'underline-links',
    'show-room-icons',
    'sidebar-size',
    'incoming-inline-images-default-height',
    'incoming-inline-images-max-height',
    'link-preview-image-max-height',
  ],
  notifications: [
    'background-push-notifications',
    'clear-notifications-when-read-elsewhere',
    'contains-display-name',
    'contains-username',
    'direct-messages',
    'direct-messages-encrypted',
    'email-notification',
    'favicon-dot-mentions-only',
    'highlight-mentions',
    'in-app-notification-sound',
    'in-app-notifications',
    'mention-room',
    'mention-user-id',
    'reset-all-push-notifications',
    'rooms',
    'rooms-encrypted',
    'select-keyword',
    'show-dm-counts',
    'show-encrypted-message-content',
    'show-mention-counts',
    'show-message-content',
    'show-room-counts',
    'system-notifications',
  ],
  devices: [
    'device-dashboard',
    'device-verification',
    'export-messages-data',
    'import-messages-data',
  ],
  emojis: ['default-pack', 'select-pack'],
  'developer-tools': [
    'access-token',
    'enable-developer-tools',
    'export-debug-logs',
    'global-account-data',
    'sentry-category-call',
    'sentry-category-error',
    'sentry-category-general',
    'sentry-category-message',
    'sentry-category-network',
    'sentry-category-notification',
    'sentry-category-sync',
    'sentry-category-timeline',
    'sentry-category-ui',
    'session-activity',
    'session-error-budget',
    'session-replay',
    'traces-profiles',
  ],
  experimental: ['bandwidth-saving-emojis', 'sharehistory-command', 'show-personas-tab'],
  about: [
    'base-url',
    'clear-cache-and-reload',
    'domain',
    'federation-url',
    'homeserver-compiler',
    'homeserver-name',
    'homeserver-version',
    'report-an-issue',
  ],
  'keyboard-shortcuts': [],
};

const settingsLinkFocusIdsBySectionSet = settingsSections.reduce(
  (acc, section) => {
    acc[section.id] = new Set(settingsLinkFocusIdsBySection[section.id]);
    return acc;
  },
  {} as Record<SettingsSectionId, ReadonlySet<string>>
);

export const normalizeSettingsFocusId = (focus?: string): string | undefined => {
  if (!focus || !SETTINGS_FOCUS_ID_PATTERN.test(focus)) {
    return undefined;
  }

  return focus;
};

const isShareableSettingsFocusId = (section: SettingsSectionId, focus: string): boolean =>
  settingsLinkFocusIdsBySectionSet[section].has(focus);

const parseSettingsLinkQuery = (
  search: string
): { focus?: string; hasActionMarker: boolean } | undefined => {
  const params = new URLSearchParams(search);

  if (
    Array.from(params.entries()).some(
      ([key, value]) =>
        SETTINGS_LINK_FORBIDDEN_QUERY_VALUE_PATTERN.test(key) ||
        SETTINGS_LINK_FORBIDDEN_QUERY_VALUE_PATTERN.test(value)
    )
  ) {
    return undefined;
  }

  const focusValues = params.getAll('focus');
  if (focusValues.length > 1) {
    return undefined;
  }

  const focus = focusValues[0];
  if (focus !== undefined && normalizeSettingsFocusId(focus) === undefined) {
    return undefined;
  }

  const actionValues = params.getAll(SETTINGS_LINK_ACTION_PARAM);
  if (actionValues.length > 1) {
    return undefined;
  }

  const action = actionValues[0];
  if (action !== undefined && action !== SETTINGS_LINK_ACTION_SETTINGS) {
    return undefined;
  }

  return {
    focus,
    hasActionMarker: action === SETTINGS_LINK_ACTION_SETTINGS,
  };
};

const withSettingsLinkAction = (path: string): string => {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  params.set(SETTINGS_LINK_ACTION_PARAM, SETTINGS_LINK_ACTION_SETTINGS);

  return `${pathname}?${params.toString()}`;
};

const parseSettingsAppPath = (appPath: string): SettingsLink | undefined => {
  if (!appPath.startsWith('/settings/')) return undefined;

  const [pathname = '', search = ''] = appPath.split('?');
  const sectionMatch = pathname.match(/^\/settings\/([^/]+)\/?$/);
  if (!sectionMatch) return undefined;

  const section = sectionMatch[1];
  if (!isSettingsSectionId(section)) return undefined;

  const query = parseSettingsLinkQuery(search);
  if (!query) return undefined;

  if (query.focus && !isShareableSettingsFocusId(section, query.focus)) {
    return undefined;
  }

  return { section, focus: query.focus };
};

const hasSettingsLinkAction = (search: string): boolean =>
  parseSettingsLinkQuery(search)?.hasActionMarker === true;

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

  const [hashPathname = '', hashSearch = ''] = hashPath.split('?');
  return getCrossBaseSettingsAppPath(hashPathname, hashSearch);
};

export const buildSettingsLink = (
  baseUrl: string,
  section: SettingsSectionId,
  focus?: string
): string => withOriginBaseUrl(baseUrl, withSettingsLinkAction(getSettingsPath(section, focus)));

const humanizeSettingsLinkPart = (value: string): string =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const getSettingsLinkLabel = (section: SettingsSectionId, focus?: string): string => {
  const sectionLabel = settingsSectionLabel[section];
  const focusLabel = focus ? humanizeSettingsLinkPart(focus) : undefined;

  return focusLabel ? `Settings > ${sectionLabel} > ${focusLabel}` : `Settings > ${sectionLabel}`;
};

export const getSettingsLinkChipLabel = (section: SettingsSectionId, focus?: string): string => {
  const sectionLabel = settingsSectionLabel[section];
  const focusLabel = focus ? humanizeSettingsLinkPart(focus) : undefined;

  return focusLabel ? `${sectionLabel} / ${focusLabel}` : sectionLabel;
};

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
