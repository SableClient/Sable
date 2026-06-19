import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import type { ClientConfig } from '$hooks/useClientConfig';
import { trimTrailingSlash } from '$utils/common';
import { fetch } from '$utils/fetch';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ConfigLoadFailureKind = 'http' | 'network' | 'unknown';

export class ClientConfigLoadError extends Error {
  public readonly attempts: number;

  public readonly kind: ConfigLoadFailureKind;

  public readonly status?: number;

  public readonly statusText?: string;

  public readonly url: string;

  public constructor(options: {
    attempts: number;
    kind: ConfigLoadFailureKind;
    url: string;
    status?: number;
    statusText?: string;
    cause?: unknown;
  }) {
    const { attempts, kind, status, statusText, url, cause } = options;
    const detail =
      kind === 'http' && status
        ? `HTTP ${status}${statusText ? ` ${statusText}` : ''}`
        : kind === 'network'
          ? 'network failure'
          : 'unexpected error';
    super(`Failed to load app configuration after ${attempts} attempts: ${detail}`, { cause });
    this.name = 'ClientConfigLoadError';
    this.attempts = attempts;
    this.kind = kind;
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}

function classifyConfigLoadFailure(
  error: unknown,
  attempts: number,
  url: string
): ClientConfigLoadError {
  const message = error instanceof Error ? error.message : String(error);
  const httpMatch = /^HTTP (\d+):\s*(.*)$/.exec(message);
  if (httpMatch) {
    const [, statusTextNumber, statusText = ''] = httpMatch;
    return new ClientConfigLoadError({
      attempts,
      kind: 'http',
      status: Number(statusTextNumber),
      statusText,
      url,
      cause: error,
    });
  }

  if (/load failed|network/i.test(message)) {
    return new ClientConfigLoadError({
      attempts,
      kind: 'network',
      url,
      cause: error,
    });
  }

  return new ClientConfigLoadError({
    attempts,
    kind: 'unknown',
    url,
    cause: error,
  });
}

function shouldCaptureConfigLoadFailure(error: ClientConfigLoadError): boolean {
  if (error.kind === 'network') return false;
  if (error.kind === 'http' && error.status === 403) return false;
  return true;
}

export const buildConfigAttemptUrl = (baseUrl: string, attempt: number): string => {
  if (attempt === 0) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}cacheBust=${Date.now()}-${attempt}`;
};

/**
 * Fetch the client config with retry logic and exponential backoff.
 * config.json is a static asset served locally, so transient failures are likely
 * caused by service worker issues or deploy races. Retrying ensures the app
 * doesn't start with incorrect configuration.
 */
export const getClientConfig = async (): Promise<ClientConfig> => {
  const url = `${trimTrailingSlash(import.meta.env.BASE_URL)}/config.json`;
  const maxAttempts = 3;

  // Sequential retries with exponential backoff are intentional — we need to wait
  // before retrying, so parallel Promise.all would be incorrect here.
  // eslint-disable-next-line no-await-in-loop
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptUrl = buildConfigAttemptUrl(url, attempt);
    try {
      Sentry.addBreadcrumb({
        category: 'config',
        message: `Fetching config.json (attempt ${attempt + 1}/${maxAttempts})`,
        level: 'info',
        data: { url: attemptUrl },
      });

      // eslint-disable-next-line no-await-in-loop -- Retries intentionally happen in sequence.
      const config = await fetch(attemptUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
      });
      if (!config.ok) {
        throw new Error(`HTTP ${config.status}: ${config.statusText}`);
      }

      // eslint-disable-next-line no-await-in-loop -- JSON must be parsed for the active attempt before retry logic continues.
      const data = await config.json();

      Sentry.addBreadcrumb({
        category: 'config',
        message: 'config.json loaded successfully',
        level: 'info',
        data: { attempt: attempt + 1 },
      });

      return data;
    } catch (err) {
      const isLastAttempt = attempt === maxAttempts - 1;
      const errorMessage = err instanceof Error ? err.message : String(err);

      Sentry.addBreadcrumb({
        category: 'config',
        message: `config.json fetch failed (attempt ${attempt + 1}/${maxAttempts})`,
        level: isLastAttempt ? 'error' : 'warning',
        data: { error: errorMessage },
      });

      if (isLastAttempt) {
        const classifiedError = classifyConfigLoadFailure(err, maxAttempts, attemptUrl);
        if (shouldCaptureConfigLoadFailure(classifiedError)) {
          Sentry.captureException(classifiedError, {
            tags: {
              category: 'config',
              config_failure_kind: classifiedError.kind,
            },
            extra: {
              attempts: maxAttempts,
              finalAttemptUrl: attemptUrl,
              status: classifiedError.status,
              statusText: classifiedError.statusText,
            },
          });
        }
        throw classifiedError;
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms
      const backoffMs = 500 * Math.pow(2, attempt);
      // eslint-disable-next-line no-await-in-loop -- Backoff delay must complete before the next retry starts.
      await sleep(backoffMs);
    }
  }

  // TypeScript exhaustiveness check (unreachable)
  throw new Error('Unreachable: config fetch loop exited without return or throw');
};

type ClientConfigLoaderProps = {
  fallback?: () => ReactNode;
  error?: (err: unknown, retry: () => void, ignore: () => void) => ReactNode;
  children: (config: ClientConfig) => ReactNode;
};
export function ClientConfigLoader({ fallback, error, children }: ClientConfigLoaderProps) {
  const [state, load] = useAsyncCallback(getClientConfig);
  const [ignoreError, setIgnoreError] = useState(false);

  const ignoreCallback = useCallback(() => setIgnoreError(true), []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading) {
    return fallback?.();
  }

  if (!ignoreError && state.status === AsyncStatus.Error) {
    return error?.(state.error, load, ignoreCallback);
  }

  const config: ClientConfig = state.status === AsyncStatus.Success ? state.data : {};

  return children(config);
}
