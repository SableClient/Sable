export type SettingsSectionId =
  | 'general'
  | 'account'
  | 'persona'
  | 'appearance'
  | 'notifications'
  | 'devices'
  | 'emojis'
  | 'developer-tools'
  | 'experimental'
  | 'about'
  | 'keyboard-shortcuts';

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
};

export const settingsSections = [
  { id: 'general', label: 'General' },
  { id: 'account', label: 'Account' },
  { id: 'persona', label: 'Persona' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'devices', label: 'Devices' },
  { id: 'emojis', label: 'Emojis & Stickers' },
  { id: 'developer-tools', label: 'Developer Tools' },
  { id: 'experimental', label: 'Experimental' },
  { id: 'about', label: 'About' },
  { id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts' },
] as const satisfies readonly SettingsSection[];

export const isSettingsSectionId = (value?: string): value is SettingsSectionId =>
  settingsSections.some((section) => section.id === value);
