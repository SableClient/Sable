import { atom, type WritableAtom } from 'jotai';
import type { Store } from 'jotai/vanilla/store';
import { mobileOrTablet } from '$utils/user-agent';

const STORAGE_KEY = 'settings';
export type DateFormat = 'D MMM YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY/MM/DD' | '';
export type MessageSpacing = '0' | '100' | '200' | '300' | '400' | '500';
export enum MessageLayout {
  Modern = 0,
  Compact = 1,
  Bubble = 2,
}

export enum RightSwipeAction {
  Members = 'members',
  Reply = 'reply',
}

export enum CaptionPosition {
  Above = 'above',
  Inline = 'inline',
  Hidden = 'hidden',
  Below = 'below',
}

export enum ShowRoomIcon {
  Always = 'always',
  Smart = 'smart',
  Never = 'never',
}
export type JumboEmojiSize = 'none' | 'extraSmall' | 'small' | 'normal' | 'large' | 'extraLarge';

export type ThemeRemoteFavorite = {
  fullUrl: string;
  displayName: string;
  basename: string;
  kind: 'light' | 'dark';
  pinned?: boolean;
  importedLocal?: boolean;
};

export type ThemeRemoteTweakFavorite = {
  fullUrl: string;
  displayName: string;
  basename: string;
  pinned?: boolean;
  importedLocal?: boolean;
};

/** Custom profile card hero colors: which brightness schemes to honor. */
export type RenderUserCardsMode = 'both' | 'light' | 'dark' | 'none';

export function shouldApplyUserHeroCards(
  mode: RenderUserCardsMode,
  brightness: string | undefined
): boolean {
  if (mode === 'none') return false;
  if (mode === 'both') return true;
  if (brightness !== 'light' && brightness !== 'dark') return false;
  return brightness === mode;
}

export interface Settings {
  themeId?: string;
  useSystemTheme: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  useSystemArboriumTheme: boolean;
  arboriumThemeId?: string;
  arboriumLightTheme?: string;
  arboriumDarkTheme?: string;
  saturationLevel?: number;
  uniformIcons: boolean;
  twitterEmoji: boolean;
  pageZoom: number;
  hideActivity: boolean;

  isPeopleDrawer: boolean;
  isWidgetDrawer: boolean;
  memberSortFilterIndex: number;
  enterForNewline: boolean;
  editorToolbar: boolean;
  composerToolbarOpen: boolean;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  showHiddenEvents: boolean;
  showTombstoneEvents: boolean;
  legacyUsernameColor: boolean;

  mediaAutoLoad: boolean;
  multiplePreviews: boolean;
  bundledPreview: boolean;
  urlPreview: boolean;
  encUrlPreview: boolean;
  clientUrlPreview: boolean;
  encClientUrlPreview: boolean;
  clientPreviewYoutube: boolean;

  usePushNotifications: boolean;
  useInAppNotifications: boolean;
  useSystemNotifications: boolean;
  isNotificationSounds: boolean;
  showMessageContentInNotifications: boolean;
  showMessageContentInEncryptedNotifications: boolean;
  clearNotificationsOnRead: boolean;

  hour24Clock: boolean;
  dateFormatString: string;

  developerTools: boolean;
  enableMSC4268CMD: boolean;
  settingsSyncEnabled: boolean;

  // Cosmetics!
  jumboEmojiSize: JumboEmojiSize;
  privacyBlur: boolean;
  privacyBlurAvatars: boolean;
  privacyBlurEmotes: boolean;
  showPronouns: boolean;
  parsePronouns: boolean;
  renderGlobalNameColors: boolean;
  renderUserCards: RenderUserCardsMode;
  filterPronounsBasedOnLanguage?: boolean;
  filterPronounsLanguages?: string[];
  renderRoomColors: boolean;
  renderRoomFonts: boolean;
  captionPosition: CaptionPosition;
  customDMCards: boolean;

  // Sable features!
  sendPresence: boolean;
  mobileGestures: boolean;
  rightSwipeAction: RightSwipeAction;
  hideMembershipInReadOnly: boolean;
  useRightBubbles: boolean;
  showUnreadCounts: boolean;
  badgeCountDMsOnly: boolean;
  showPingCounts: boolean;
  showEasterEggs: boolean;
  hideReads: boolean;
  emojiSuggestThreshold: number;
  underlineLinks: boolean;
  reducedMotion: boolean;
  autoplayGifs: boolean;
  autoplayStickers: boolean;
  autoplayEmojis: boolean;
  incomingInlineImagesDefaultHeight: number;
  incomingInlineImagesMaxHeight: number;
  linkPreviewImageMaxHeight: number;
  saveStickerEmojiBandwidth: boolean;
  subspaceHierarchyLimit: number;
  alwaysShowCallButton: boolean;
  joinCallOnSingleClick: boolean;
  faviconForMentionsOnly: boolean;
  highlightMentions: boolean;
  pkCompat: boolean;
  pmpProxying: boolean;
  mentionInReplies: boolean;
  showPersonaSetting: boolean;
  closeFoldersByDefault: boolean;
  showRoomIcon: ShowRoomIcon;
  showRoomBanners: boolean;
  roomSidebarWidth: number;
  roomBannerHeight: number;
  memberSidebarWidth: number;
  threadSidebarWidth: number;
  threadRootHeight: number;
  vcmsgSidebarWidth: number;
  widgetSidebarWidth: number;

  // furry stuff
  renderAnimals: boolean;

  // theme catalog
  themeCatalogOnboardingDone: boolean;
  themeRemoteFavorites: ThemeRemoteFavorite[];
  themeRemoteCatalogEnabled: boolean;
  themeChatSableWidgetsEnabled: boolean;
  themeChatAutoPreviewApprovedUrls: boolean;
  themeChatAutoPreviewAnyUrl: boolean;
  themeRemoteManualFullUrl?: string;
  themeRemoteLightFullUrl?: string;
  themeRemoteDarkFullUrl?: string;
  themeRemoteManualKind?: 'light' | 'dark';
  themeRemoteLightKind?: 'light' | 'dark';
  themeRemoteDarkKind?: 'light' | 'dark';
  themeMigrationDismissed: boolean;
  themeRemoteTweakFavorites: ThemeRemoteTweakFavorite[];
  themeRemoteEnabledTweakFullUrls: string[];
}

export const defaultSettings: Settings = {
  themeId: undefined,
  useSystemTheme: true,
  lightThemeId: undefined,
  darkThemeId: undefined,
  useSystemArboriumTheme: true,
  arboriumThemeId: 'dracula',
  arboriumLightTheme: 'github-light',
  arboriumDarkTheme: 'dracula',
  saturationLevel: 100,
  uniformIcons: false,
  twitterEmoji: true,
  pageZoom: 100,
  hideActivity: false,

  isPeopleDrawer: true,
  isWidgetDrawer: false,
  memberSortFilterIndex: 0,
  enterForNewline: false,
  editorToolbar: false,
  composerToolbarOpen: false,
  messageLayout: 0,
  messageSpacing: '400',
  hideMembershipEvents: false,
  hideNickAvatarEvents: true,
  mediaAutoLoad: true,
  multiplePreviews: true,
  bundledPreview: true,
  urlPreview: true,
  encUrlPreview: false,
  clientUrlPreview: false,
  encClientUrlPreview: false,
  clientPreviewYoutube: false,
  showHiddenEvents: false,
  showTombstoneEvents: false,
  legacyUsernameColor: false,

  enableMSC4268CMD: false,

  // Push notifications (SW/Sygnal): default on for mobile, opt-in on desktop.
  // In-app pill banner: default on for mobile (primary foreground alert), opt-in on desktop.
  // System (OS) notifications: desktop-only; hidden and disabled on mobile.
  usePushNotifications: mobileOrTablet(),
  useInAppNotifications: mobileOrTablet(),
  useSystemNotifications: !mobileOrTablet(),
  isNotificationSounds: true,
  showMessageContentInNotifications: false,
  showMessageContentInEncryptedNotifications: false,
  clearNotificationsOnRead: false,

  hour24Clock: false,
  dateFormatString: 'D MMM YYYY',

  developerTools: false,
  settingsSyncEnabled: false,

  // Cosmetics!
  jumboEmojiSize: 'normal',
  privacyBlur: false,
  privacyBlurAvatars: false,
  privacyBlurEmotes: false,
  showPronouns: true,
  parsePronouns: true,
  renderGlobalNameColors: true,
  renderUserCards: 'both',
  renderRoomColors: true,
  renderRoomFonts: true,
  captionPosition: CaptionPosition.Below,
  customDMCards: true,

  // Sable features!
  sendPresence: true,
  mobileGestures: true,
  rightSwipeAction: RightSwipeAction.Reply,
  hideMembershipInReadOnly: true,
  useRightBubbles: false,
  showUnreadCounts: false,
  badgeCountDMsOnly: true,
  showPingCounts: true,
  showEasterEggs: true,
  hideReads: false,
  emojiSuggestThreshold: 2,
  underlineLinks: false,
  reducedMotion: false,
  autoplayGifs: true,
  autoplayStickers: true,
  autoplayEmojis: true,
  incomingInlineImagesDefaultHeight: 32,
  incomingInlineImagesMaxHeight: 64,
  linkPreviewImageMaxHeight: 640,
  saveStickerEmojiBandwidth: false,
  subspaceHierarchyLimit: 3,
  alwaysShowCallButton: false,
  joinCallOnSingleClick: true,
  faviconForMentionsOnly: false,
  highlightMentions: true,
  pkCompat: false,
  pmpProxying: false,
  mentionInReplies: true,
  showPersonaSetting: false,
  closeFoldersByDefault: false,
  showRoomIcon: ShowRoomIcon.Smart,
  showRoomBanners: true,
  roomSidebarWidth: 256,
  roomBannerHeight: 190,
  memberSidebarWidth: 262,
  threadSidebarWidth: 440,
  threadRootHeight: 220,
  vcmsgSidebarWidth: 399,
  widgetSidebarWidth: 420,
  // furry stuff
  renderAnimals: true,

  // theme catalog
  themeCatalogOnboardingDone: false,
  themeRemoteFavorites: [],
  themeRemoteCatalogEnabled: false,
  themeChatSableWidgetsEnabled: true,
  themeChatAutoPreviewApprovedUrls: true,
  themeChatAutoPreviewAnyUrl: false,
  themeRemoteManualFullUrl: undefined,
  themeRemoteLightFullUrl: undefined,
  themeRemoteDarkFullUrl: undefined,
  themeRemoteManualKind: undefined,
  themeRemoteLightKind: undefined,
  themeRemoteDarkKind: undefined,
  themeMigrationDismissed: false,
  themeRemoteTweakFavorites: [],
  themeRemoteEnabledTweakFullUrls: [],
};

function cloneDefaultSettings(): Settings {
  return {
    ...defaultSettings,
    themeRemoteFavorites: defaultSettings.themeRemoteFavorites.map((x) => ({
      ...x,
    })),
    themeRemoteTweakFavorites: defaultSettings.themeRemoteTweakFavorites.map((x) => ({ ...x })),
    themeRemoteEnabledTweakFullUrls: [...defaultSettings.themeRemoteEnabledTweakFullUrls],
  };
}

function migrateParsedLocalStorage(parsed: Record<string, unknown>): void {
  if (parsed.monochromeMode === true && parsed.saturationLevel === undefined) {
    parsed.saturationLevel = 0;
  } else if (parsed.monochromeMode === false && parsed.saturationLevel === undefined) {
    parsed.saturationLevel = 100;
  }
  delete parsed.monochromeMode;

  if (typeof parsed.renderUserCards === 'boolean') {
    parsed.renderUserCards = parsed.renderUserCards ? 'both' : 'none';
  } else if (
    parsed.renderUserCards !== 'both' &&
    parsed.renderUserCards !== 'light' &&
    parsed.renderUserCards !== 'dark' &&
    parsed.renderUserCards !== 'none'
  ) {
    parsed.renderUserCards = 'both';
  }

  if (
    typeof parsed.themeChatAutoPreviewAnyUrl !== 'boolean' &&
    typeof parsed.themeChatPreviewAnyUrl === 'boolean'
  ) {
    parsed.themeChatAutoPreviewAnyUrl = parsed.themeChatPreviewAnyUrl;
  }
  delete parsed.themeChatPreviewAnyUrl;
  delete parsed.themeChatPreviewApprovedCatalogOnly;
}

export function mergePersistedSettings(
  rawLocalStorage: string | null,
  fileDefaults: Partial<Settings>
): Settings {
  const base = { ...defaultSettings, ...fileDefaults };
  if (rawLocalStorage === null) return base;

  const parsed = JSON.parse(rawLocalStorage) as Record<string, unknown>;
  migrateParsedLocalStorage(parsed);

  return {
    ...base,
    ...(parsed as unknown as Settings),
  };
}

const MESSAGE_SPACING_VALUES = new Set<MessageSpacing>(['0', '100', '200', '300', '400', '500']);
const JUMBO_EMOJI_VALUES = new Set<JumboEmojiSize>([
  'none',
  'extraSmall',
  'small',
  'normal',
  'large',
  'extraLarge',
]);

function sanitizeStringArray(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const out = val.filter((x): x is string => typeof x === 'string');
  return out;
}

function sanitizeThemeRemoteFavorites(val: unknown): ThemeRemoteFavorite[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const out: ThemeRemoteFavorite[] = [];
  for (const item of val) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (
      typeof o.fullUrl === 'string' &&
      typeof o.displayName === 'string' &&
      typeof o.basename === 'string' &&
      (o.kind === 'light' || o.kind === 'dark')
    ) {
      out.push({
        fullUrl: o.fullUrl,
        displayName: o.displayName,
        basename: o.basename,
        kind: o.kind,
        pinned: typeof o.pinned === 'boolean' ? o.pinned : undefined,
        importedLocal: typeof o.importedLocal === 'boolean' ? o.importedLocal : undefined,
      });
    }
  }
  return out;
}

function sanitizeThemeRemoteTweakFavorites(val: unknown): ThemeRemoteTweakFavorite[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const out: ThemeRemoteTweakFavorite[] = [];
  for (const item of val) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (
      typeof o.fullUrl === 'string' &&
      typeof o.displayName === 'string' &&
      typeof o.basename === 'string'
    ) {
      out.push({
        fullUrl: o.fullUrl,
        displayName: o.displayName,
        basename: o.basename,
        pinned: typeof o.pinned === 'boolean' ? o.pinned : undefined,
        importedLocal: typeof o.importedLocal === 'boolean' ? o.importedLocal : undefined,
      });
    }
  }
  return out;
}

function isSanitizableSettingsKey(k: string): k is keyof Settings {
  return (
    k in defaultSettings || k === 'filterPronounsBasedOnLanguage' || k === 'filterPronounsLanguages'
  );
}

function sanitizeSettingsKey(key: keyof Settings, val: unknown): unknown {
  switch (key) {
    case 'filterPronounsBasedOnLanguage':
      return typeof val === 'boolean' ? val : undefined;
    case 'filterPronounsLanguages':
      return sanitizeStringArray(val);
    case 'messageLayout':
      return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 2
        ? val
        : undefined;
    case 'messageSpacing':
      return typeof val === 'string' && MESSAGE_SPACING_VALUES.has(val as MessageSpacing)
        ? val
        : undefined;
    case 'captionPosition':
      return val === CaptionPosition.Above ||
        val === CaptionPosition.Inline ||
        val === CaptionPosition.Hidden ||
        val === CaptionPosition.Below
        ? val
        : undefined;
    case 'rightSwipeAction':
      return val === RightSwipeAction.Members || val === RightSwipeAction.Reply ? val : undefined;
    case 'renderUserCards':
      return val === 'both' || val === 'light' || val === 'dark' || val === 'none'
        ? val
        : undefined;
    case 'jumboEmojiSize':
      return typeof val === 'string' && JUMBO_EMOJI_VALUES.has(val as JumboEmojiSize)
        ? val
        : undefined;
    case 'themeRemoteManualKind':
    case 'themeRemoteLightKind':
    case 'themeRemoteDarkKind':
      return val === 'light' || val === 'dark' ? val : undefined;
    case 'themeRemoteFavorites':
      return sanitizeThemeRemoteFavorites(val);
    case 'themeRemoteTweakFavorites':
      return sanitizeThemeRemoteTweakFavorites(val);
    case 'themeRemoteEnabledTweakFullUrls':
      return sanitizeStringArray(val);
    default: {
      if (!(key in defaultSettings)) return undefined;
      const sample = defaultSettings[key];
      if (typeof sample === 'boolean') {
        return typeof val === 'boolean' ? val : undefined;
      }
      if (typeof sample === 'number') {
        return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
      }
      if (typeof sample === 'string') {
        return typeof val === 'string' ? val : undefined;
      }
      if (sample === undefined) {
        return typeof val === 'string' ? val : undefined;
      }
      return undefined;
    }
  }
}

export function sanitizeSettingsDefaults(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<Settings> = {};
  const warnings: string[] = [];

  for (const k of Object.keys(src)) {
    if (!isSanitizableSettingsKey(k)) {
      warnings.push(k);
      continue;
    }
    const sanitized = sanitizeSettingsKey(k, src[k]);
    if (sanitized !== undefined) {
      (out as Record<string, unknown>)[k] = sanitized;
    } else if (src[k] !== undefined) {
      warnings.push(k);
    }
  }

  if (import.meta.env.DEV && warnings.length > 0) {
    console.warn(
      '[config.settingsDefaults] ignored unknown or invalid keys:',
      [...new Set(warnings)].slice(0, 25).join(', ')
    );
  }

  return out;
}

let runtimeSettingsDefaults: Partial<Settings> = {};

/** @internal Resets deploy-time defaults, only used in tests. */
export function resetRuntimeSettingsDefaults(): void {
  runtimeSettingsDefaults = {};
}

export const baseSettings = atom<Settings>(cloneDefaultSettings());

export function bootstrapSettingsStore(store: Store, rawSettingsDefaults: unknown): void {
  const sanitized = sanitizeSettingsDefaults(rawSettingsDefaults);
  runtimeSettingsDefaults = sanitized;
  const merged = mergePersistedSettings(localStorage.getItem(STORAGE_KEY), sanitized);
  store.set(baseSettings, merged);
}

export const getSettings = (): Settings =>
  mergePersistedSettings(localStorage.getItem(STORAGE_KEY), runtimeSettingsDefaults);

export const setSettings = (settings: Settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const settingsAtom = atom<Settings, [Settings], undefined>(
  (get) => get(baseSettings),
  (_get, set, update) => {
    (set as (atom: WritableAtom<Settings, [Settings], void>, val: Settings) => void)(
      baseSettings as WritableAtom<Settings, [Settings], void>,
      update
    );
    setSettings(update);
  }
);
