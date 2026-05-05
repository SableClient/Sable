import { atom, type WritableAtom } from 'jotai';
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
  saveStickerEmojiBandwidth: boolean;
  subspaceHierarchyLimit: number;
  alwaysShowCallButton: boolean;
  faviconForMentionsOnly: boolean;
  highlightMentions: boolean;
  pkCompat: boolean;
  pmpProxying: boolean;
  mentionInReplies: boolean;
  showPersonaSetting: boolean;
  closeFoldersByDefault: boolean;

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
  saveStickerEmojiBandwidth: false,
  subspaceHierarchyLimit: 3,
  alwaysShowCallButton: false,
  faviconForMentionsOnly: false,
  highlightMentions: true,
  pkCompat: false,
  pmpProxying: false,
  mentionInReplies: true,
  showPersonaSetting: false,
  closeFoldersByDefault: false,

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

export const getSettings = () => {
  const settings = localStorage.getItem(STORAGE_KEY);
  if (settings === null) return defaultSettings;

  // migration for old keys
  // monochrome -> saturation
  const parsed = JSON.parse(settings);
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

  const parsedRecord = parsed as Record<string, unknown>;
  if (
    typeof parsedRecord.themeChatAutoPreviewAnyUrl !== 'boolean' &&
    typeof parsedRecord.themeChatPreviewAnyUrl === 'boolean'
  ) {
    parsedRecord.themeChatAutoPreviewAnyUrl = parsedRecord.themeChatPreviewAnyUrl;
  }
  delete parsedRecord.themeChatPreviewAnyUrl;
  delete parsedRecord.themeChatPreviewApprovedCatalogOnly;

  return {
    ...defaultSettings,
    ...(parsed as Settings),
  };
};

export const setSettings = (settings: Settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const baseSettings = atom(getSettings());
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
