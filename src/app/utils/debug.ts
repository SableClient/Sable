/**
 * Lightweight debug logger for the account switcher (and other features).
 *
 * Enable in the browser console:
 *   localStorage.setItem('sable_debug', '1'); location.reload();
 *
 * Disable:
 *   localStorage.removeItem('sable_debug'); location.reload();
 */

export const isDebug = (): boolean =>
  import.meta.env.DEV || localStorage.getItem('sable_debug') === '1';

type LogLevel = 'log' | 'warn' | 'error';

const fmt = (namespace: string, level: LogLevel, ...args: unknown[]): void => {
  if (!isDebug() && level === 'log') return;
  const prefix = `[sable:${namespace}]`;
  // eslint-disable-next-line no-console
  console[level](prefix, ...args);
};

export const createLogger = (namespace: string) => ({
  log: (...args: unknown[]) => fmt(namespace, 'log', ...args),
  warn: (...args: unknown[]) => fmt(namespace, 'warn', ...args),
  error: (...args: unknown[]) => fmt(namespace, 'error', ...args),
});
