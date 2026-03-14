/**
 * Enhanced debug logger for Sable with circular buffer storage and categorization.
 *
 * Enable via Developer Tools UI or with:
 *   localStorage.setItem('sable_internal_debug', '1'); location.reload();
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'sync'
  | 'network'
  | 'notification'
  | 'message'
  | 'call'
  | 'ui'
  | 'timeline'
  | 'error'
  | 'general';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  namespace: string;
  message: string;
  data?: unknown;
}

type LogListener = (entry: LogEntry) => void;

class DebugLoggerService {
  private logs: LogEntry[] = [];

  private maxLogs = 1000; // Circular buffer size

  private enabled = false;

  private listeners: Set<LogListener> = new Set();

  constructor() {
    // Check if debug logging is enabled from localStorage
    this.enabled = localStorage.getItem('sable_internal_debug') === '1';
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      localStorage.setItem('sable_internal_debug', '1');
    } else {
      localStorage.removeItem('sable_internal_debug');
    }
  }

  public addListener(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(entry: LogEntry): void {
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (error) {
        // Silently catch listener errors to prevent debug logging from breaking the app
        console.error('[DebugLogger] Listener error:', error);
      }
    });
  }

  public log(
    level: LogLevel,
    category: LogCategory,
    namespace: string,
    message: string,
    data?: unknown
  ): void {
    if (!this.enabled && level !== 'error') return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      namespace,
      message,
      data,
    };

    // Add to circular buffer
    if (this.logs.length >= this.maxLogs) {
      this.logs.shift(); // Remove oldest entry
    }
    this.logs.push(entry);

    // Notify listeners
    this.notifyListeners(entry);

    // Also log to console for developer convenience
    const prefix = `[sable:${category}:${namespace}]`;
    const consoleLevel = level === 'debug' ? 'log' : level;
    // eslint-disable-next-line no-console
    console[consoleLevel](prefix, message, data !== undefined ? data : '');
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public getFilteredLogs(filters?: {
    level?: LogLevel;
    category?: LogCategory;
    since?: number;
  }): LogEntry[] {
    let filtered = [...this.logs];

    if (filters?.level) {
      filtered = filtered.filter((log) => log.level === filters.level);
    }

    if (filters?.category) {
      filtered = filtered.filter((log) => log.category === filters.category);
    }

    if (filters?.since) {
      const { since } = filters;
      filtered = filtered.filter((log) => log.timestamp >= since);
    }

    return filtered;
  }

  public clear(): void {
    this.logs = [];
  }

  public exportLogs(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        build: `v${APP_VERSION}${BUILD_HASH ? ` (${BUILD_HASH})` : ''}`,
        logsCount: this.logs.length,
        logs: this.logs.map((log) => ({
          ...log,
          timestamp: new Date(log.timestamp).toISOString(),
        })),
      },
      null,
      2
    );
  }
}

// Singleton instance
const debugLoggerService = new DebugLoggerService();

export const getDebugLogger = (): DebugLoggerService => debugLoggerService;

/**
 * Creates a logger for a specific namespace
 */
export const createDebugLogger = (namespace: string) => ({
  debug: (category: LogCategory, message: string, data?: unknown) =>
    debugLoggerService.log('debug', category, namespace, message, data),
  info: (category: LogCategory, message: string, data?: unknown) =>
    debugLoggerService.log('info', category, namespace, message, data),
  warn: (category: LogCategory, message: string, data?: unknown) =>
    debugLoggerService.log('warn', category, namespace, message, data),
  error: (category: LogCategory, message: string, data?: unknown) =>
    debugLoggerService.log('error', category, namespace, message, data),
});
