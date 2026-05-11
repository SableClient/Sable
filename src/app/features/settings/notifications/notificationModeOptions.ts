import { type SettingMenuOption } from '$components/setting-menu-selector';
import { NotificationMode } from '$hooks/useNotificationMode';

export const notificationModeSelectorOptions: SettingMenuOption<NotificationMode>[] = [
  { value: NotificationMode.NotifyLoud, label: 'Notify Loud' },
  { value: NotificationMode.Notify, label: 'Notify Silent' },
  { value: NotificationMode.OFF, label: 'Disable' },
];
