import type { DateFormat, MessageSpacing } from '$state/settings';
import { CaptionPosition, MessageLayout, ShowRoomIcon } from '$state/settings';
import type { SettingMenuOption } from './SettingMenuSelector';

export const MESSAGE_LAYOUT_OPTIONS: SettingMenuOption<MessageLayout>[] = [
  { value: MessageLayout.Modern, label: 'Modern' },
  { value: MessageLayout.Compact, label: 'Compact' },
  { value: MessageLayout.Bubble, label: 'Bubble' },
];

export const MESSAGE_SPACING_OPTIONS: SettingMenuOption<MessageSpacing>[] = [
  { value: '0', label: 'None' },
  { value: '100', label: 'Ultra Small' },
  { value: '200', label: 'Extra Small' },
  { value: '300', label: 'Small' },
  { value: '400', label: 'Normal' },
  { value: '500', label: 'Large' },
];

export const CAPTION_POSITION_OPTIONS: SettingMenuOption<CaptionPosition>[] = [
  { value: CaptionPosition.Above, label: 'Above' },
  { value: CaptionPosition.Inline, label: 'Inline' },
  { value: CaptionPosition.Hidden, label: 'Hidden' },
  { value: CaptionPosition.Below, label: 'Below' },
];

export const SHOW_ROOM_ICON_OPTIONS: SettingMenuOption<ShowRoomIcon>[] = [
  { value: ShowRoomIcon.Always, label: 'Always' },
  { value: ShowRoomIcon.Strict, label: 'Sometimes' },
  { value: ShowRoomIcon.Smart, label: 'Collapsed' },
  { value: ShowRoomIcon.Never, label: 'Never' },
];

/** Sentinel for rooms that follow the account wide icon setting. */
export const SHOW_ROOM_ICON_DEFAULT = 'default';
export type ShowRoomIconValue = ShowRoomIcon | typeof SHOW_ROOM_ICON_DEFAULT;

export const PER_ROOM_SHOW_ROOM_ICON_OPTIONS: SettingMenuOption<ShowRoomIconValue>[] = [
  { value: SHOW_ROOM_ICON_DEFAULT, label: 'Default' },
  ...SHOW_ROOM_ICON_OPTIONS,
];

/** Sentinel for rooms that follow the account wide media-blur setting. */
export const PRIVACY_BLUR_DEFAULT = 'default';
export type PrivacyBlurValue = typeof PRIVACY_BLUR_DEFAULT | 'on' | 'off';

export const PER_ROOM_PRIVACY_BLUR_OPTIONS: SettingMenuOption<PrivacyBlurValue>[] = [
  { value: PRIVACY_BLUR_DEFAULT, label: 'Default' },
  { value: 'on', label: 'Blur' },
  { value: 'off', label: "Don't Blur" },
];

/** Labels are the current date rendered in each pattern, so they are built at render. */
export const DATE_FORMATS: DateFormat[] = [
  'D MMM YYYY',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY/MM/DD',
  '',
];

export type PanelSizeKey =
  | 'roomSidebarWidth'
  | 'memberSidebarWidth'
  | 'threadSidebarWidth'
  | 'threadRootHeight'
  | 'vcmsgSidebarWidth'
  | 'widgetSidebarWidth'
  | 'roomBannerHeight';

export const PANEL_SIZE_OPTIONS: SettingMenuOption<PanelSizeKey>[] = [
  { value: 'roomSidebarWidth', label: 'Room Panel Width' },
  { value: 'memberSidebarWidth', label: 'Member Panel Width' },
  { value: 'threadSidebarWidth', label: 'Thread Panel Width' },
  { value: 'threadRootHeight', label: 'Thread Root Height' },
  { value: 'vcmsgSidebarWidth', label: 'VoiceCall Msg Panel Width' },
  { value: 'widgetSidebarWidth', label: 'Widget Panel Width' },
  { value: 'roomBannerHeight', label: 'Room Banner Height' },
];
