import { atom, type WritableAtom } from 'jotai';
import type { Store } from 'jotai/vanilla/store';
import { isNightly } from '$utils/platform';
import { isMobileOrTablet } from '$utils/platform';
import type {
  NotificationTransportMode,
  NotificationTransportProvider,
  PushTransportOverrides,
} from '$features/settings/notifications/NotificationTransport';
import type { IImageInfo } from '$types/matrix/common';
import type { GifProviderSetting } from '$utils/gifProviders';
import { isLocalImportTweakUrl } from '../theme/localImportUrls';
import { sanitizeShortcutOverrides, type ShortcutOverrides } from '../keyboard/shortcuts';

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
  Strict = 'strict',
  Smart = 'smart',
  Never = 'never',
}
export type PerRoomShowRoomIcon = {
  roomId: string;
  display: ShowRoomIcon;
};

export type JumboEmojiSize = 'none' | 'extraSmall' | 'small' | 'normal' | 'large' | 'extraLarge';

/** Reorderable inline trigger buttons in the message composer. */
export type EditorButtonId = 'gif' | 'sticker' | 'emoji';
const EDITOR_BUTTON_ORDER_DEFAULT: EditorButtonId[] = ['gif', 'sticker', 'emoji'];
const EDITOR_BUTTON_ORDER_VALUES = new Set<EditorButtonId>(EDITOR_BUTTON_ORDER_DEFAULT);
export const CALL_TONE_IDS = [
  'sable-default',
  'classic-soft',
  'minimal-ping',
  'silent',
  'custom',
] as const;
export type CallRingtoneId = (typeof CALL_TONE_IDS)[number];

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
  /** CSS for locally imported tweaks, replicated with settings for device restore. */
  cssText?: string;
};

/** Custom profile card hero colors: which brightness schemes to honor. */
export type RenderUserCardsMode = 'both' | 'light' | 'dark' | 'none';

/** Where to use crisp nearest-neighbor (pixelated) image scaling. */
export type PixelatedImageRenderingMode = 'always' | 'smart' | 'never';
export type ProfileChangePropagation = 'all' | 'unchanged' | 'none';

export function isPixelatedRendering(
  mode: PixelatedImageRenderingMode,
  info?: IImageInfo
): boolean {
  if (mode === 'smart') return !!info && !!info.w && !!info.h && (info.w < 192 || info.h < 192);
  return mode === 'always';
}

export function shouldApplyUserHeroCards(
  mode: RenderUserCardsMode,
  brightness?: string,
  color?: string
): boolean {
  if (!color || (brightness !== 'light' && brightness !== 'dark')) return false;
  if (mode === 'none') return false;
  if (mode === 'both') return true;
  return brightness === mode;
}

export interface Settings {
  shortcutOverrides: ShortcutOverrides;
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
  appIconId?: string;
  twitterEmoji: boolean;
  pageZoom: number;
  hideActivity: boolean;

  isPeopleDrawer: boolean;
  isWidgetDrawer: boolean;
  memberSortFilterIndex: number;
  enterForNewline: boolean;
  editorToolbar: boolean;
  editorOldAddFile: boolean;
  editorMicButton: boolean;
  editorEmojiButton: boolean;
  editorGifButton: boolean;
  gifProvider: GifProviderSetting;
  editorStickerButton: boolean;
  editorTriggerButtonsMigrated: boolean;
  editorButtonOrder: EditorButtonId[];
  composerToolbarOpen: boolean;
  showMarkdownPreview: boolean;
  alwaysInlineEditor: boolean;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  showHiddenEvents: boolean;
  showTombstoneEvents: boolean;
  hiddenEventEdits: boolean;
  hiddenEventRedactionTimeline: boolean;
  hiddenEventReactions: boolean;
  hiddenEventReactionTombstone: boolean;
  hiddenEventReactionRedactionTimeline: boolean;
  hiddenEventOther: boolean;
  legacyUsernameColor: boolean;

  mediaAutoLoad: boolean;
  multiplePreviews: boolean;
  bundledPreview: boolean;
  urlPreview: boolean;
  encUrlPreview: boolean;
  clientUrlPreview: boolean;
  encClientUrlPreview: boolean;
  externalGifAutoLoadEncrypted: boolean;
  clientPreviewYoutube: boolean;
  enableGifPicker: boolean;
  showInteractiveMap: boolean;
  showEncInteractiveMap: boolean;

  usePushNotifications: boolean;
  useUnifiedPush: boolean;
  useInAppNotifications: boolean;
  useSystemNotifications: boolean;
  isNotificationSounds: boolean;
  backgroundNotificationSounds: boolean;
  showMessageContentInNotifications: boolean;
  showMessageContentInEncryptedNotifications: boolean;
  useRichPushPayloads: boolean;
  pushNotifyUrlOverride?: string;
  clearNotificationsOnRead: boolean;
  backgroundPushEnabled: boolean;
  backgroundPushProvider: NotificationTransportProvider | null;
  pushTransportMode: NotificationTransportMode;
  pushTransportOverride: PushTransportOverrides;

  hour24Clock: boolean;
  dateFormatString: string;
  showAllTimestamps: boolean;

  developerTools: boolean;
  enableMSC4268CMD: boolean;
  enableMediaGalleries: boolean;
  newCallsEnabled: boolean;
  settingsSyncEnabled: boolean;

  // Cosmetics!
  iconCompactSizePx: number;
  iconInlineSizePx: number;
  iconToolbarSizePx: number;
  iconEmptySizePx: number;
  jumboEmojiSize: JumboEmojiSize;
  privacyBlur: boolean;
  privacyBlurAvatars: boolean;
  privacyBlurEmotes: boolean;
  showPronouns: boolean;
  parsePronouns: boolean;
  pronounPillMaxCount: number;
  pronounPillMaxLength: number;
  renderGlobalNameColors: boolean;
  renderUserCards: RenderUserCardsMode;
  filterPronounsBasedOnLanguage?: boolean;
  filterPronounsLanguages?: string[];
  renderRoomColors: boolean;
  renderRoomFonts: boolean;
  renderPersonaColors: boolean;
  captionPosition: CaptionPosition;
  customDMCards: boolean;

  // Sable features!
  sendPresence: boolean;
  rightSwipeAction: RightSwipeAction;
  hideMembershipInReadOnly: boolean;
  useRightBubbles: boolean;
  showUnreadCounts: boolean;
  badgeCountDMsOnly: boolean;
  showPingCounts: boolean;
  showEasterEggs: boolean;
  hideReads: boolean;
  emojiSuggestThreshold: number;
  oldSidebar: boolean;
  pixelatedImageRendering: PixelatedImageRenderingMode;
  incomingInlineImagesDefaultHeight: number;
  incomingInlineImagesMaxHeight: number;
  linkPreviewImageMaxHeight: number;
  saveStickerEmojiBandwidth: boolean;
  subspaceHierarchyLimit: number;
  alwaysShowCallButton: boolean;
  joinCallOnSingleClick: boolean;
  incomingCallSoundEnabled: boolean;
  incomingVoiceRoomCallSoundEnabled: boolean;
  outgoingRingbackEnabled: boolean;
  callRingtoneVolume: number;
  callRingtoneId: CallRingtoneId;
  callRingbackTone: CallRingtoneId;
  callSoundOverrideGlobalNotifications: boolean;
  faviconForMentionsOnly: boolean;
  highlightMentions: boolean;
  pkCompat: boolean;
  pmpProxying: boolean;
  pmpLatching: boolean;
  pmpPicker: boolean;
  pmpNoFallback: boolean;
  mentionInReplies: boolean;
  profileChangePropagation: ProfileChangePropagation;
  showPersonaSetting: boolean;
  closeFoldersByDefault: boolean;
  perRoomShowRoomIcon: PerRoomShowRoomIcon[];
  showRoomIcon: ShowRoomIcon;
  roomIconOverlay: boolean;
  showRoomBanners: boolean;
  roomSidebarWidth: number;
  roomBannerHeight: number;
  memberSidebarWidth: number;
  threadSidebarWidth: number;
  threadRootHeight: number;
  vcmsgSidebarWidth: number;
  widgetSidebarWidth: number;
  isShowingAllRoomsInHome: boolean;
  sendIndividualAttachmentAsCaption: boolean;

  // accessibility stuff
  underlineLinks: boolean;
  reducedMotion: boolean;
  autoplayGifs: boolean;
  autoplayStickers: boolean;
  autoplayEmojis: boolean;
  nameColorLightnessCorrection: 'off' | 'weak' | 'strong';
  nameColorLightnessCorrectionMigrated: boolean;

  // furry stuff
  renderAnimals: boolean;
  animalKind: string | undefined;

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
  shortcutOverrides: {},
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
  appIconId: undefined,
  twitterEmoji: true,
  pageZoom: 100,
  hideActivity: false,

  isPeopleDrawer: true,
  isWidgetDrawer: false,
  memberSortFilterIndex: 0,
  enterForNewline: isMobileOrTablet(),
  editorToolbar: false,
  editorOldAddFile: false,
  editorMicButton: true,
  editorEmojiButton: true,
  editorGifButton: true,
  gifProvider: 'default',
  editorStickerButton: true,
  editorTriggerButtonsMigrated: true,
  editorButtonOrder: [...EDITOR_BUTTON_ORDER_DEFAULT],
  composerToolbarOpen: false,
  showMarkdownPreview: false,
  alwaysInlineEditor: false,
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
  externalGifAutoLoadEncrypted: false,
  clientPreviewYoutube: false,
  enableGifPicker: true,
  showInteractiveMap: true,
  showEncInteractiveMap: false,
  showHiddenEvents: false,
  showTombstoneEvents: true,
  hiddenEventEdits: true,
  hiddenEventRedactionTimeline: true,
  hiddenEventReactions: true,
  hiddenEventReactionTombstone: true,
  hiddenEventReactionRedactionTimeline: true,
  hiddenEventOther: true,
  legacyUsernameColor: false,

  enableMSC4268CMD: false,
  enableMediaGalleries: false,
  newCallsEnabled: false,

  // Push notifications (SW/Sygnal): default on for mobile, opt-in on desktop.
  // In-app pill banner: default on for mobile (primary foreground alert), opt-in on desktop.
  // System (OS) notifications: desktop-only; hidden and disabled on mobile.
  usePushNotifications: isMobileOrTablet(),
  useUnifiedPush: false,
  useInAppNotifications: isMobileOrTablet(),
  useSystemNotifications: !isMobileOrTablet(),
  isNotificationSounds: true,
  backgroundNotificationSounds: true,
  showMessageContentInNotifications: false,
  showMessageContentInEncryptedNotifications: false,
  useRichPushPayloads: true,
  pushNotifyUrlOverride: undefined,
  clearNotificationsOnRead: false,
  backgroundPushEnabled: isMobileOrTablet(),
  backgroundPushProvider: null,
  pushTransportMode: 'auto',
  pushTransportOverride: {},

  hour24Clock: false,
  dateFormatString: 'D MMM YYYY',
  showAllTimestamps: false,

  developerTools: false,
  settingsSyncEnabled: false,

  // Cosmetics!
  iconCompactSizePx: 16,
  iconInlineSizePx: 20,
  iconToolbarSizePx: 24,
  iconEmptySizePx: 32,
  jumboEmojiSize: 'normal',
  privacyBlur: false,
  privacyBlurAvatars: false,
  privacyBlurEmotes: false,
  showPronouns: true,
  parsePronouns: true,
  pronounPillMaxCount: isMobileOrTablet() ? 1 : 3,
  pronounPillMaxLength: 16,
  renderGlobalNameColors: true,
  renderUserCards: 'both',
  renderRoomColors: true,
  renderRoomFonts: true,
  renderPersonaColors: true,
  captionPosition: CaptionPosition.Below,
  customDMCards: true,

  // Sable features!
  sendPresence: true,
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
  oldSidebar: false,
  pixelatedImageRendering: 'smart',
  incomingInlineImagesDefaultHeight: 32,
  incomingInlineImagesMaxHeight: 64,
  linkPreviewImageMaxHeight: 640,
  saveStickerEmojiBandwidth: false,
  subspaceHierarchyLimit: 3,
  alwaysShowCallButton: false,
  joinCallOnSingleClick: false,
  incomingCallSoundEnabled: true,
  incomingVoiceRoomCallSoundEnabled: false,
  outgoingRingbackEnabled: true,
  callRingtoneVolume: 80,
  callRingtoneId: 'sable-default',
  callRingbackTone: 'sable-default',
  callSoundOverrideGlobalNotifications: false,
  faviconForMentionsOnly: false,
  highlightMentions: true,
  pkCompat: false,
  pmpProxying: false,
  pmpLatching: false,
  pmpPicker: false,
  pmpNoFallback: false,
  mentionInReplies: true,
  profileChangePropagation: 'unchanged',
  showPersonaSetting: false,
  closeFoldersByDefault: false,
  perRoomShowRoomIcon: [],
  showRoomIcon: ShowRoomIcon.Strict,
  roomIconOverlay: true,
  showRoomBanners: true,
  roomSidebarWidth: 256,
  roomBannerHeight: 190,
  memberSidebarWidth: 262,
  threadSidebarWidth: 440,
  threadRootHeight: 220,
  vcmsgSidebarWidth: 399,
  widgetSidebarWidth: 420,
  isShowingAllRoomsInHome: false,
  sendIndividualAttachmentAsCaption: true,
  nameColorLightnessCorrection: 'strong',
  nameColorLightnessCorrectionMigrated: true,

  // furry stuff
  renderAnimals: true,
  animalKind: undefined,

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
    shortcutOverrides: { ...defaultSettings.shortcutOverrides },
    themeRemoteFavorites: defaultSettings.themeRemoteFavorites.map((x) => ({
      ...x,
    })),
    themeRemoteTweakFavorites: defaultSettings.themeRemoteTweakFavorites.map((x) => ({ ...x })),
    themeRemoteEnabledTweakFullUrls: [...defaultSettings.themeRemoteEnabledTweakFullUrls],
    editorButtonOrder: [...defaultSettings.editorButtonOrder],
  };
}

const CALL_TONE_ID_SET = new Set<unknown>(CALL_TONE_IDS);

const isCallToneId = (value: unknown): value is CallRingtoneId => CALL_TONE_ID_SET.has(value);

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

function migrateParsedLocalStorage(parsed: Record<string, unknown>): void {
  if (typeof parsed.backgroundPushEnabled !== 'boolean') {
    const legacyProvider = parsed.useUnifiedPush === true ? 'unifiedpush' : null;
    if (
      legacyProvider !== null ||
      typeof parsed.usePushNotifications === 'boolean' ||
      typeof parsed.useUnifiedPush === 'boolean'
    ) {
      parsed.backgroundPushEnabled =
        legacyProvider !== null || parsed.usePushNotifications === true;
      parsed.backgroundPushProvider = legacyProvider;
    }
  }

  const shortcutOverrides = sanitizeShortcutOverrides(parsed.shortcutOverrides);
  if (shortcutOverrides) parsed.shortcutOverrides = shortcutOverrides;
  else delete parsed.shortcutOverrides;

  if (parsed.monochromeMode === true && parsed.saturationLevel === undefined) {
    parsed.saturationLevel = 0;
  } else if (parsed.monochromeMode === false && parsed.saturationLevel === undefined) {
    parsed.saturationLevel = 100;
  }
  delete parsed.monochromeMode;

  if (parsed.editorTriggerButtonsMigrated !== true) {
    delete parsed.editorGifButton;
    delete parsed.editorStickerButton;
    parsed.editorTriggerButtonsMigrated = true;
  }

  if (parsed.nameColorLightnessCorrectionMigrated !== true) {
    delete parsed.nameColorLightnessCorrection;
    parsed.nameColorLightnessCorrectionMigrated = true;
  } else if (
    parsed.nameColorLightnessCorrection !== 'off' &&
    parsed.nameColorLightnessCorrection !== 'weak' &&
    parsed.nameColorLightnessCorrection !== 'strong'
  ) {
    delete parsed.nameColorLightnessCorrection;
  }

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

  if (typeof parsed.pixelatedImageRendering === 'boolean') {
    parsed.pixelatedImageRendering = parsed.pixelatedImageRendering ? 'both' : 'none';
  } else if (
    parsed.pixelatedImageRendering !== 'always' &&
    parsed.pixelatedImageRendering !== 'smart' &&
    parsed.pixelatedImageRendering !== 'never'
  ) {
    delete parsed.pixelatedImageRendering;
  }

  if (
    typeof parsed.themeChatAutoPreviewAnyUrl !== 'boolean' &&
    typeof parsed.themeChatPreviewAnyUrl === 'boolean'
  ) {
    parsed.themeChatAutoPreviewAnyUrl = parsed.themeChatPreviewAnyUrl;
  }
  delete parsed.themeChatPreviewAnyUrl;
  delete parsed.themeChatPreviewApprovedCatalogOnly;

  // Consolidate the legacy LiveKit JS experiments into the single new-call gate.
  if (
    typeof parsed.newCallsEnabled !== 'boolean' &&
    (parsed.livekitJsCallsEnabled === true || parsed.livekitJsMediaTestEnabled === true)
  ) {
    parsed.newCallsEnabled = true;
  }
  delete parsed.livekitJsCallsEnabled;
  delete parsed.livekitJsMediaTestEnabled;

  if (typeof parsed.callRingtoneVolume === 'number' && Number.isFinite(parsed.callRingtoneVolume)) {
    parsed.callRingtoneVolume = clampPercent(parsed.callRingtoneVolume);
  }

  if (!isCallToneId(parsed.callRingtoneId)) {
    delete parsed.callRingtoneId;
  }

  if (parsed.callRingbackTone === 'same-as-ringtone') {
    parsed.callRingbackTone = parsed.callRingtoneId ?? defaultSettings.callRingtoneId;
  } else if (parsed.callRingbackTone === 'default-ringback') {
    parsed.callRingbackTone = 'classic-soft';
  }

  if (!isCallToneId(parsed.callRingbackTone)) {
    delete parsed.callRingbackTone;
  }

  const legacyCallCustomMetadataKeys = [
    'callCustomRingtoneName',
    'callCustomRingtoneSizeBytes',
    'callCustomRingtoneDurationMs',
    'callCustomRingbackName',
    'callCustomRingbackSizeBytes',
    'callCustomRingbackDurationMs',
  ] as const;

  for (const key of legacyCallCustomMetadataKeys) {
    delete parsed[key];
  }
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

function sanitizeIconSizePx(val: unknown): number | undefined {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0 ? val : undefined;
}

function sanitizeStringArray(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const out = val.filter((x): x is string => typeof x === 'string');
  return out;
}

function sanitizeEditorButtonOrder(val: unknown): EditorButtonId[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const out: EditorButtonId[] = [];
  const seen = new Set<EditorButtonId>();
  for (const x of val) {
    if (typeof x === 'string' && EDITOR_BUTTON_ORDER_VALUES.has(x as EditorButtonId)) {
      const id = x as EditorButtonId;
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  // Append any missing buttons in default order so the array is always complete.
  for (const id of EDITOR_BUTTON_ORDER_DEFAULT) {
    if (!seen.has(id)) out.push(id);
  }
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

export function sanitizeThemeRemoteTweakFavorites(
  val: unknown
): ThemeRemoteTweakFavorite[] | undefined {
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
      const cssText =
        isLocalImportTweakUrl(o.fullUrl) && typeof o.cssText === 'string' ? o.cssText : undefined;
      out.push({
        fullUrl: o.fullUrl,
        displayName: o.displayName,
        basename: o.basename,
        pinned: typeof o.pinned === 'boolean' ? o.pinned : undefined,
        importedLocal: typeof o.importedLocal === 'boolean' ? o.importedLocal : undefined,
        cssText,
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
    case 'shortcutOverrides':
      return sanitizeShortcutOverrides(val);
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
    case 'callRingtoneId':
    case 'callRingbackTone':
      return isCallToneId(val) ? val : undefined;
    case 'callRingtoneVolume':
      if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
      return clampPercent(val);
    case 'renderUserCards':
      return val === 'both' || val === 'light' || val === 'dark' || val === 'none'
        ? val
        : undefined;
    case 'pixelatedImageRendering':
      return val === 'always' || val === 'smart' || val === 'never' ? val : undefined;
    case 'profileChangePropagation':
      return val === 'all' || val === 'unchanged' || val === 'none' ? val : undefined;
    case 'iconCompactSizePx':
    case 'iconInlineSizePx':
    case 'iconToolbarSizePx':
    case 'iconEmptySizePx':
      return sanitizeIconSizePx(val);
    case 'jumboEmojiSize':
      return typeof val === 'string' && JUMBO_EMOJI_VALUES.has(val as JumboEmojiSize)
        ? val
        : undefined;
    case 'pronounPillMaxCount':
      return typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 10
        ? val
        : undefined;
    case 'pronounPillMaxLength':
      return typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 64
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
    case 'editorButtonOrder':
      return sanitizeEditorButtonOrder(val);
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

  if (isNightly() && warnings.length > 0) {
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

const baseSettings = atom<Settings>(cloneDefaultSettings());

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
