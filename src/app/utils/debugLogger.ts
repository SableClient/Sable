/**
 * Enhanced debug logger for Sable with circular buffer storage and categorization.
 *
 * Enable via Developer Tools UI or with:
 *   localStorage.setItem('sable_internal_debug', '1'); location.reload();
 */

import * as Sentry from '@sentry/react';

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

    // Send to Sentry
    DebugLoggerService.sendToSentry(entry);

    // Also log to console for developer convenience
    const prefix = `[sable:${category}:${namespace}]`;
    const consoleLevel = level === 'debug' ? 'log' : level;
    // eslint-disable-next-line no-console
    console[consoleLevel](prefix, message, data !== undefined ? data : '');
  }

  /**
   * Send log entries to Sentry for error tracking and breadcrumbs
   */
  private static sendToSentry(entry: LogEntry): void {
    // Map log levels to Sentry severity
    const sentryLevelMap: Record<string, Sentry.SeverityLevel> = {
      debug: 'debug',
      info: 'info',
      warn: 'warning',
      error: 'error',
    };
    const sentryLevel: Sentry.SeverityLevel = sentryLevelMap[entry.level] ?? 'error';

    // Add breadcrumb for all logs (helps with debugging in Sentry)
    Sentry.addBreadcrumb({
      category: `${entry.category}.${entry.namespace}`,
      message: entry.message,
      level: sentryLevel,
      data: entry.data ? { data: entry.data } : undefined,
      timestamp: entry.timestamp / 1000, // Sentry expects seconds
    });

    // Send as structured log to the Sentry Logs product (requires enableLogs: true)
    const logMsg = `[${entry.category}:${entry.namespace}] ${entry.message}`;
    const logAttrs = { category: entry.category, namespace: entry.namespace };
    if (entry.level === 'debug') Sentry.logger.debug(logMsg, logAttrs);
    else if (entry.level === 'info') Sentry.logger.info(logMsg, logAttrs);
    else if (entry.level === 'warn') Sentry.logger.warn(logMsg, logAttrs);
    else Sentry.logger.error(logMsg, logAttrs);

    // Track error/warn rates as metrics, tagged by category for filtering in Sentry dashboards
    if (entry.level === 'error' || entry.level === 'warn') {
      Sentry.metrics.count(`sable.${entry.level}s`, 1, {
        attributes: { category: entry.category, namespace: entry.namespace },
      });
    }

    // Capture errors and warnings as Sentry events
    if (entry.level === 'error') {
      // If data is an Error object, capture it as an exception
      if (entry.data instanceof Error) {
        Sentry.captureException(entry.data, {
          level: 'error',
          tags: {
            category: entry.category,
            namespace: entry.namespace,
          },
          contexts: {
            debugLog: {
              message: entry.message,
              timestamp: new Date(entry.timestamp).toISOString(),
            },
          },
        });
      } else {
        // Otherwise capture as a message
        Sentry.captureMessage(`[${entry.category}:${entry.namespace}] ${entry.message}`, {
          level: 'error',
          tags: {
            category: entry.category,
            namespace: entry.namespace,
          },
          contexts: {
            debugLog: {
              data: entry.data,
              timestamp: new Date(entry.timestamp).toISOString(),
            },
          },
        });
      }
    } else if (entry.level === 'warn' && Math.random() < 0.1) {
      // Capture 10% of warnings to avoid overwhelming Sentry
      Sentry.captureMessage(`[${entry.category}:${entry.namespace}] ${entry.message}`, {
        level: 'warning',
        tags: {
          category: entry.category,
          namespace: entry.namespace,
        },
        contexts: {
          debugLog: {
            data: entry.data,
            timestamp: new Date(entry.timestamp).toISOString(),
          },
        },
      });
    }
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

  /**
   * Export logs in a format suitable for attaching to Sentry reports
   */
  public exportLogsForSentry(): Record<string, unknown>[] {
    return this.logs.map((log) => ({
      timestamp: new Date(log.timestamp).toISOString(),
      level: log.level,
      category: log.category,
      namespace: log.namespace,
      message: log.message,
      data: log.data,
    }));
  }

  /**
   * Attach recent logs to the next Sentry event
   * Useful for bug reports to include context
   */
  public attachLogsToSentry(limit = 100): void {
    const recentLogs = this.logs.slice(-limit);
    const logsData = recentLogs.map((log) => ({
      time: new Date(log.timestamp).toISOString(),
      level: log.level,
      category: log.category,
      namespace: log.namespace,
      message: log.message,
      // Only include data for errors/warnings to avoid excessive payload
      ...(log.level === 'error' || log.level === 'warn' ? { data: log.data } : {}),
    }));

    // Add to context
    Sentry.setContext('recentLogs', {
      count: recentLogs.length,
      logs: logsData,
    });

    // Also add as extra data for better visibility in Sentry UI
    Sentry.getCurrentScope().setExtra('debugLogs', logsData);

    // Add as attachment for download
    const logsText = JSON.stringify(logsData, null, 2);
    Sentry.getCurrentScope().addAttachment({
      filename: 'debug-logs.json',
      data: logsText,
      contentType: 'application/json',
    });
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
