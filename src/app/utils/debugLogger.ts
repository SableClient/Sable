/**
 * Enhanced debug logger for Sable with circular buffer storage and categorization.
 *
 * Enable via Developer Tools UI or with:
 *   localStorage.setItem('sable_internal_debug', '1'); location.reload();
 */

import * as Sentry from '@sentry/react';
import { versionLabel } from '$utils/platform';
import { sanitizeDiagnosticsLogs, sanitizeSentryPayload } from './sentryScrubbers';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'sync'
  | 'network'
  | 'notification'
  | 'message'
  | 'media'
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

const BREADCRUMB_DISABLED_KEY = 'sable_sentry_breadcrumb_disabled';

type ConsoleMethod = 'error' | 'warn' | 'info' | 'log' | 'debug';

const CONSOLE_METHODS: ConsoleMethod[] = ['error', 'warn', 'info', 'log', 'debug'];

const MAX_CONSOLE_MESSAGE_LENGTH = 1000;

const formatConsoleArgs = (args: unknown[]): string => {
  const text = args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.stack ?? arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
  return text.length > MAX_CONSOLE_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_CONSOLE_MESSAGE_LENGTH)}…`
    : text;
};

class DebugLoggerService {
  private logs: LogEntry[] = [];

  private maxLogs = 1000; // Circular buffer size

  private enabled = false;

  private captureActive = false;

  private captureSince: number | undefined;

  private listeners: Set<LogListener> = new Set();

  private disabledBreadcrumbCategories: Set<LogCategory>;

  private sentryStats = { errors: 0, warnings: 0 };

  private originalConsole: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};

  private consoleIntercepted = false;

  private writingToConsole = false;

  constructor() {
    // Check if debug logging is enabled from localStorage
    this.enabled = localStorage.getItem('sable_internal_debug') === '1';
    // Load disabled breadcrumb categories
    try {
      const stored = localStorage.getItem(BREADCRUMB_DISABLED_KEY);
      this.disabledBreadcrumbCategories = new Set(
        stored ? (JSON.parse(stored) as LogCategory[]) : []
      );
    } catch {
      this.disabledBreadcrumbCategories = new Set();
    }
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

  public isCaptureActive(): boolean {
    return this.captureActive;
  }

  public getCaptureSince(): number | undefined {
    return this.captureSince;
  }

  public startCapture(): number {
    this.clear();
    this.captureActive = true;
    this.captureSince = Date.now();
    this.interceptConsole();
    this.log('info', 'general', 'diagnostics', 'Diagnostic capture started');
    return this.captureSince;
  }

  public stopCapture(): number | undefined {
    if (!this.captureActive) return this.captureSince;
    this.log('info', 'general', 'diagnostics', 'Diagnostic capture stopped');
    this.captureActive = false;
    this.restoreConsole();
    return this.captureSince;
  }

  /**
   * Funnels console output (including matrix-js-sdk's logger, which writes to the
   * console) into the capture buffer for the duration of a diagnostics session.
   */
  private interceptConsole(): void {
    if (this.consoleIntercepted) return;
    this.consoleIntercepted = true;
    CONSOLE_METHODS.forEach((method) => {
      const original = console[method] as (...args: unknown[]) => void;
      this.originalConsole[method] = original;
      console[method] = (...args: unknown[]) => {
        original.apply(console, args);
        if (this.writingToConsole) return;
        const level: LogLevel = method === 'log' ? 'debug' : method;
        this.log(
          level,
          level === 'error' ? 'error' : 'general',
          'console',
          formatConsoleArgs(args)
        );
      };
    });
  }

  private restoreConsole(): void {
    if (!this.consoleIntercepted) return;
    this.consoleIntercepted = false;
    CONSOLE_METHODS.forEach((method) => {
      const original = this.originalConsole[method];
      if (original) console[method] = original;
    });
    this.originalConsole = {};
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
    const operationalCategory =
      category === 'sync' ||
      category === 'network' ||
      category === 'notification' ||
      category === 'media' ||
      category === 'call' ||
      category === 'error';
    if (
      !this.enabled &&
      !this.captureActive &&
      level !== 'error' &&
      !(operationalCategory && level === 'warn')
    )
      return;

    const rawEntry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      namespace,
      message,
      data,
    };
    // Omit arbitrary data before serialization; it may be circular or contain BigInts.
    const sanitized = sanitizeDiagnosticsLogs(
      JSON.stringify({ logs: [{ ...rawEntry, data: undefined }] })
    );
    if (!sanitized) return;
    const parsed = JSON.parse(sanitized) as { logs?: LogEntry[] };
    const entry = parsed.logs?.[0];
    if (!entry) return;
    // Preserve the original Error for Sentry exception capture.
    if (rawEntry.data instanceof Error) entry.data = rawEntry.data;

    // Add to circular buffer
    if (this.logs.length >= this.maxLogs) {
      this.logs.shift(); // Remove oldest entry
    }
    this.logs.push(entry);

    if (!this.enabled && level !== 'error') return;

    // Notify listeners
    this.notifyListeners(entry);

    // Send to Sentry
    this.sendToSentry(entry);

    // Also log to console for developer convenience
    const prefix = `[sable:${category}:${namespace}]`;
    const consoleLevel = level === 'debug' ? 'log' : level;
    this.writingToConsole = true;
    try {
      console[consoleLevel](prefix, message, data !== undefined ? data : '');
    } finally {
      this.writingToConsole = false;
    }
  }

  public getBreadcrumbCategoryEnabled(category: LogCategory): boolean {
    return !this.disabledBreadcrumbCategories.has(category);
  }

  public setBreadcrumbCategoryEnabled(category: LogCategory, enabled: boolean): void {
    if (enabled) {
      this.disabledBreadcrumbCategories.delete(category);
    } else {
      this.disabledBreadcrumbCategories.add(category);
    }
    const disabledArray = Array.from(this.disabledBreadcrumbCategories);
    if (disabledArray.length > 0) {
      localStorage.setItem(BREADCRUMB_DISABLED_KEY, JSON.stringify(disabledArray));
    } else {
      localStorage.removeItem(BREADCRUMB_DISABLED_KEY);
    }
  }

  public getSentryStats(): { errors: number; warnings: number } {
    return { ...this.sentryStats };
  }

  /**
   * Send log entries to Sentry for error tracking and breadcrumbs
   */
  private sendToSentry(entry: LogEntry): void {
    // Map log levels to Sentry severity
    const sentryLevelMap: Record<string, Sentry.SeverityLevel> = {
      debug: 'debug',
      info: 'info',
      warn: 'warning',
      error: 'error',
    };
    const sentryLevel: Sentry.SeverityLevel = sentryLevelMap[entry.level] ?? 'error';

    let sanitizedData: unknown;
    if (entry.data !== undefined && !(entry.data instanceof Error)) {
      try {
        sanitizedData = sanitizeSentryPayload(entry.data);
      } catch {
        // Sentry data is best-effort and must not break logging.
        sanitizedData = undefined;
      }
    }

    // Add breadcrumb for all logs (helps with debugging in Sentry), unless category is disabled
    if (!this.disabledBreadcrumbCategories.has(entry.category))
      Sentry.addBreadcrumb({
        category: `${entry.category}.${entry.namespace}`,
        message: entry.message,
        level: sentryLevel,
        data:
          sanitizedData !== undefined && sanitizedData !== null
            ? { data: sanitizedData }
            : undefined,
        timestamp: entry.timestamp / 1000, // Sentry expects seconds
      });

    // Send as structured log to the Sentry Logs product (requires enableLogs: true)
    const logMsg = `[${entry.category}:${entry.namespace}] ${entry.message}`;
    // Flatten primitive values from entry.data so they become searchable attributes in Sentry Logs
    const logDataAttrs: Record<string, string | number | boolean> = {};
    if (sanitizedData && typeof sanitizedData === 'object' && !(sanitizedData instanceof Error)) {
      Object.entries(sanitizedData as Record<string, unknown>).forEach(([k, v]) => {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          logDataAttrs[k] = v;
        }
      });
    }
    const logAttrs = {
      category: entry.category,
      namespace: entry.namespace,
      ...logDataAttrs,
    };
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
      this.sentryStats.errors += 1;
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
              data: sanitizedData,
              timestamp: new Date(entry.timestamp).toISOString(),
            },
          },
        });
      }
    } else if (entry.level === 'warn' && Math.random() < 0.1) {
      // Capture 10% of warnings to avoid overwhelming Sentry
      this.sentryStats.warnings += 1;
      Sentry.captureMessage(`[${entry.category}:${entry.namespace}] ${entry.message}`, {
        level: 'warning',
        tags: {
          category: entry.category,
          namespace: entry.namespace,
        },
        contexts: {
          debugLog: {
            data: sanitizedData,
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

  public exportLogs(options?: { since?: number }): string {
    const logs = options?.since ? this.getFilteredLogs({ since: options.since }) : this.logs;
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        build: versionLabel({ includeNightly: false }),
        logsCount: logs.length,
        logs: logs.map((log) => ({
          ...log,
          ...(log.data instanceof Error ? { data: undefined } : {}),
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

    const logsText = JSON.stringify(logsData, null, 2);
    // Add as attachment for download
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
