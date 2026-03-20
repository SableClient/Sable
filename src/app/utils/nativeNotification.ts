import { getPlatform } from '$platform/index';

interface NativeNotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  silent?: boolean;
  data?: unknown;
  onClick?: () => void;
}

/**
 * Shows a notification using the best available method:
 * 1. On Tauri: native Windows toast via custom Rust command
 * 2. On web: ServiceWorker notification (if available), then window.Notification fallback
 */
export async function showOSNotification(opts: NativeNotificationOptions): Promise<void> {
  console.warn('[notification] showOSNotification called:', opts.title);
  const platform = await getPlatform();
  console.warn('[notification] platform:', platform.name, 'supportsNative:', platform.supportsNativeNotifications);

  if (platform.supportsNativeNotifications) {
    try {
      await platform.showNotification(opts.title, {
        body: opts.body,
        icon: opts.icon,
        badge: opts.badge,
        tag: opts.tag,
        silent: opts.silent,
      });
      console.warn('[notification] native notification sent successfully');
    } catch (e) {
      console.error('[notification] native notification FAILED:', e);
    }
    return;
  }

  // Web fallback: try ServiceWorker first, then window.Notification
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(opts.title, {
        body: opts.body,
        icon: opts.icon,
        badge: opts.badge,
        silent: opts.silent ?? false,
        data: opts.data,
      } as NotificationOptions);
      return;
    } catch {
      // Fall through to window.Notification
    }
  }

  if ('Notification' in window && window.Notification.permission === 'granted') {
    const noti = new window.Notification(opts.title, {
      icon: opts.icon,
      badge: opts.badge,
      body: opts.body,
      silent: opts.silent ?? false,
      data: opts.data,
    });
    if (opts.onClick) {
      noti.onclick = () => {
        opts.onClick?.();
        noti.close();
      };
    }
  }
}
