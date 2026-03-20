export interface NotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  silent?: boolean;
  data?: unknown;
}

export interface AudioCaptureHandle {
  /**
   * Returns a MediaStream containing the captured audio, suitable for
   * feeding into a WebRTC peer connection or MediaRecorder.
   */
  getStream(): MediaStream;
  stop(): void;
}

export interface PlatformAdapter {
  readonly name: 'web' | 'tauri' | 'capacitor';

  /** Whether this platform supports native OS notifications (beyond Web Notification API). */
  readonly supportsNativeNotifications: boolean;

  /** Whether this platform can capture application audio for screen sharing. */
  readonly supportsAudioCapture: boolean;

  /**
   * Show a notification using the platform's native notification system.
   * Falls back to Web Notification API on platforms that don't support native.
   */
  showNotification(title: string, options?: NotificationOptions): Promise<void>;

  /**
   * Request permission for native notifications if needed.
   * Returns true if permission is granted.
   */
  requestNotificationPermission(): Promise<boolean>;

  /**
   * Start capturing audio from the application window. Used during screen
   * sharing to include application audio in the call.
   *
   * Returns null on platforms that don't support audio capture.
   */
  startAudioCapture(): Promise<AudioCaptureHandle | null>;

  /**
   * Whether the app is running in a desktop window (affects UI like title bars).
   */
  readonly isDesktop: boolean;

  /**
   * Minimize the application window. No-op on non-desktop platforms.
   */
  minimizeWindow(): Promise<void>;

  /**
   * Toggle maximize/restore of the application window.
   */
  toggleMaximizeWindow(): Promise<void>;

  /**
   * Close the application window.
   */
  closeWindow(): Promise<void>;
}
