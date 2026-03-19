import { atom } from 'jotai';
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

export interface Settings {
  themeId?: string;
  useSystemTheme: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  saturationLevel?: number;
  uniformIcons: boolean;
  isMarkdown: boolean;
  editorToolbar: boolean;
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
  mediaAutoLoad: boolean;
  urlPreview: boolean;
  encUrlPreview: boolean;
  showHiddenEvents: boolean;
  showTombstoneEvents: boolean;
  legacyUsernameColor: boolean;

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

  // Cosmetics!
  jumboEmojiSize: JumboEmojiSize;
  privacyBlur: boolean;
  privacyBlurAvatars: boolean;
  privacyBlurEmotes: boolean;
  showPronouns: boolean;
  parsePronouns: boolean;
  renderGlobalNameColors: boolean;
  filterPronounsBasedOnLanguage?: boolean;
  filterPronounsLanguages?: string[];
  renderRoomColors: boolean;
  renderRoomFonts: boolean;
  captionPosition: CaptionPosition;

  // Sable features!
  sendPresence: boolean;
  mobileGestures: boolean;
  rightSwipeAction: RightSwipeAction;
  hideMembershipInReadOnly: boolean;
  useRightBubbles: boolean;
  showUnreadCounts: boolean;
  badgeCountDMsOnly: boolean;
  showPingCounts: boolean;
  hideReads: boolean;
  emojiSuggestThreshold: number;
  underlineLinks: boolean;
  reducedMotion: boolean;
  autoplayGifs: boolean;
  autoplayStickers: boolean;
  autoplayEmojis: boolean;
  saveStickerEmojiBandwidth: boolean;
  alwaysShowCallButton: boolean;
  faviconForMentionsOnly: boolean;
  highlightMentions: boolean;

  // furry stuff
  renderAnimals: boolean;
}

const defaultSettings: Settings = {
  themeId: undefined,
  useSystemTheme: true,
  lightThemeId: undefined,
  darkThemeId: undefined,
  saturationLevel: 100,
  uniformIcons: false,
  isMarkdown: true,
  editorToolbar: false,
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
  urlPreview: true,
  encUrlPreview: false,
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

  // Cosmetics!
  jumboEmojiSize: 'normal',
  privacyBlur: false,
  privacyBlurAvatars: false,
  privacyBlurEmotes: false,
  showPronouns: true,
  parsePronouns: true,
  renderGlobalNameColors: true,
  renderRoomColors: true,
  renderRoomFonts: true,
  captionPosition: CaptionPosition.Below,

  // Sable features!
  sendPresence: true,
  mobileGestures: true,
  rightSwipeAction: RightSwipeAction.Reply,
  hideMembershipInReadOnly: true,
  useRightBubbles: false,
  showUnreadCounts: false,
  badgeCountDMsOnly: true,
  showPingCounts: true,
  hideReads: false,
  emojiSuggestThreshold: 2,
  underlineLinks: false,
  reducedMotion: false,
  autoplayGifs: true,
  autoplayStickers: true,
  autoplayEmojis: true,
  saveStickerEmojiBandwidth: false,
  alwaysShowCallButton: false,
  faviconForMentionsOnly: false,
  highlightMentions: true,

  // furry stuff
  renderAnimals: true,
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

  return {
    ...defaultSettings,
    ...(parsed as Settings),
  };
};

export const setSettings = (settings: Settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const baseSettings = atom<Settings>(getSettings());
export const settingsAtom = atom<Settings, [Settings], undefined>(
  (get) => get(baseSettings),
  (get, set, update) => {
    set(baseSettings, update);
    setSettings(update);
  }
);
