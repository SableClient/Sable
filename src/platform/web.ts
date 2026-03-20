import type { PlatformAdapter, NotificationOptions } from './types';

const webAdapter: PlatformAdapter = {
  name: 'web',
  supportsNativeNotifications: false,
  supportsAudioCapture: false,
  isDesktop: false,

  async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    new Notification(title, {
      body: options?.body,
      icon: options?.icon,
      badge: options?.badge,
      tag: options?.tag,
      silent: options?.silent,
    });
  },

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  async startAudioCapture() {
    return null;
  },

  async minimizeWindow() {},
  async toggleMaximizeWindow() {},
  async closeWindow() {},
};

export { webAdapter as adapter };
