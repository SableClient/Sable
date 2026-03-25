/**
 * Sentry instrumentation - MUST be imported first in the application lifecycle
 *
 * Configure via environment variables:
 * - VITE_SENTRY_DSN: Your Sentry DSN (required to enable Sentry)
 * - VITE_SENTRY_ENVIRONMENT: Environment name (defaults to MODE)
 * - VITE_APP_VERSION: Release version for tracking
 */
import * as Sentry from '@sentry/react';
import React from 'react';
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom';
import { scrubMatrixIds, scrubDataObject, scrubMatrixUrl } from './app/utils/sentryScrubbers';

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;
const release = import.meta.env.VITE_APP_VERSION;

// Per-session error event counter for rate limiting
let sessionErrorCount = 0;
const SESSION_ERROR_LIMIT = 50;

// Default off: Sentry only runs when the user has opted in via the banner or Settings.
const sentryEnabled = localStorage.getItem('sable_sentry_enabled') === 'true';
const replayEnabled = localStorage.getItem('sable_sentry_replay_enabled') === 'true';

// Only initialize if DSN is provided and user hasn't opted out
if (dsn && sentryEnabled) {
  Sentry.init({
    dsn,
    environment,
    release,

    // Do not send PII (IP addresses, user identifiers) to protect privacy
    sendDefaultPii: false,

    integrations: [
      // React Router v6 browser tracing integration
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      // Session replay with privacy settings (only if user opted in)
      ...(replayEnabled
        ? [
            Sentry.replayIntegration({
              maskAllText: true, // Mask all text for privacy
              blockAllMedia: true, // Block images/video/audio for privacy
              maskAllInputs: true, // Mask form inputs
            }),
          ]
        : []),
      // Capture console.error/warn as structured logs in the Sentry Logs product
      Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] }),
      // Browser profiling — captures JS call stacks during Sentry transactions
      Sentry.browserProfilingIntegration(),
    ],

    // Performance Monitoring - Tracing
    // 100% in development and preview, lower in production for cost control
    tracesSampleRate: environment === 'development' || environment === 'preview' ? 1.0 : 0.1,

    // Browser profiling — profiles every sampled session (requires Document-Policy: js-profiling response header)
    profileSessionSampleRate:
      environment === 'development' || environment === 'preview' ? 1.0 : 0.1,

    // Control which URLs get distributed tracing headers
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/[^/]*\.sable\.chat/,
      // Add your Matrix homeserver domains here if needed
    ],

    // Session Replay sampling
    // Record 100% in development and preview for testing, 10% in production
    // Always record 100% of sessions with errors
    replaysSessionSampleRate:
      environment === 'development' || environment === 'preview' ? 1.0 : 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Enable structured logging to Sentry
    enableLogs: true,

    // Scrub sensitive data from structured logs before sending to Sentry
    beforeSendLog(log) {
      // Drop debug-level logs in production to reduce noise and quota usage
      if (log.level === 'debug' && environment === 'production') return null;
      // Redact Matrix IDs and tokens from the log message string
      if (typeof log.message === 'string') {
        // eslint-disable-next-line no-param-reassign
        log.message = scrubMatrixIds(log.message);
      }
      // Redact Matrix IDs from any string-valued log attributes (e.g. roomId, userId)
      // These are flattened from the structured data object and sent as searchable attributes.
      if (log.attributes && typeof log.attributes === 'object') {
        // eslint-disable-next-line no-param-reassign
        log.attributes = scrubDataObject(log.attributes) as typeof log.attributes;
      }
      return log;
    },

    // Rate limiting: cap error events per page-load session to avoid quota exhaustion.
    // Separate counters for errors and transactions so perf traces do not drain the error budget.
    beforeSendTransaction(event) {
      // Scrub Matrix identifiers from the transaction name (the matched route or page URL).
      // React Router normally parameterises routes (e.g. /home/:roomIdOrAlias/) but falls
      // back to the raw URL when matching fails, so we scrub defensively here.
      if (event.transaction) {
        // eslint-disable-next-line no-param-reassign
        event.transaction = scrubMatrixUrl(event.transaction);
      }

      // Scrub Matrix identifiers from HTTP span descriptions and data URLs.
      // We scrub ALL string values in span.data rather than a single known key because
      // Sentry / OTel HTTP instrumentation has used multiple attribute names across versions:
      //   http.url  (OTel semconv < 1.23, Sentry classic)
      //   url.full  (OTel semconv ≥ 1.23)
      //   http.target, server.address, url, etc.
      // For each string value: apply URL scrubbing when the value starts with "http",
      // then apply ID scrubbing to catch any remaining bare Matrix IDs.
      if (event.spans) {
        // eslint-disable-next-line no-param-reassign
        event.spans = event.spans.map((span) => {
          const newDesc = span.description ? scrubMatrixUrl(span.description) : span.description;
          const spanData = span.data as Record<string, unknown> | undefined;
          const newData = spanData
            ? Object.fromEntries(
                Object.entries(spanData).map(([k, v]) => [
                  k,
                  typeof v === 'string'
                    ? scrubMatrixIds(v.startsWith('http') ? scrubMatrixUrl(v) : v)
                    : v,
                ])
              )
            : undefined;

          const descChanged = newDesc !== span.description;
          const dataChanged =
            newData !== undefined && JSON.stringify(newData) !== JSON.stringify(spanData);

          if (!descChanged && !dataChanged) return span;
          return {
            ...span,
            ...(descChanged ? { description: newDesc } : {}),
            ...(dataChanged ? { data: newData as typeof span.data } : {}),
          };
        });
      }
      return event;
    },

    // Sanitize sensitive data from all breadcrumb messages and HTTP data URLs before sending to Sentry
    beforeBreadcrumb(breadcrumb) {
      // Scrub Matrix paths from HTTP breadcrumb data.url (captures full request URLs)
      const bData = breadcrumb.data as Record<string, unknown> | undefined;
      const rawUrl = typeof bData?.url === 'string' ? bData.url : undefined;
      const scrubbedUrl = rawUrl ? scrubMatrixUrl(rawUrl) : undefined;
      const urlChanged = scrubbedUrl !== undefined && scrubbedUrl !== rawUrl;

      // Scrub Matrix paths from navigation breadcrumb data.from / data.to (page URLs that
      // may contain room IDs or user IDs as path segments in the app's client-side routes)
      const rawFrom = typeof bData?.from === 'string' ? bData.from : undefined;
      const rawTo = typeof bData?.to === 'string' ? bData.to : undefined;
      const scrubbedFrom = rawFrom ? scrubMatrixUrl(rawFrom) : undefined;
      const scrubbedTo = rawTo ? scrubMatrixUrl(rawTo) : undefined;
      const fromChanged = scrubbedFrom !== undefined && scrubbedFrom !== rawFrom;
      const toChanged = scrubbedTo !== undefined && scrubbedTo !== rawTo;

      // Scrub Matrix IDs from all remaining string values in the breadcrumb data object.
      // debugLog passes structured data (e.g. { roomId, targetEventId }) that would otherwise
      // bypass the URL-specific scrubbers above.
      const scrubbedData = bData ? (scrubDataObject(bData) as Record<string, unknown>) : undefined;

      // Scrub message text — token values and Matrix entity IDs
      const message = breadcrumb.message ? scrubMatrixIds(breadcrumb.message) : breadcrumb.message;
      const messageChanged = message !== breadcrumb.message;

      if (!messageChanged && !scrubbedData) return breadcrumb;
      return {
        ...breadcrumb,
        ...(messageChanged ? { message } : {}),
        ...(scrubbedData
          ? {
              data: {
                ...scrubbedData,
                ...(urlChanged ? { url: scrubbedUrl } : {}),
                ...(fromChanged ? { from: scrubbedFrom } : {}),
                ...(toChanged ? { to: scrubbedTo } : {}),
              },
            }
          : {}),
      };
    },

    beforeSend(event, hint) {
      sessionErrorCount += 1;
      if (sessionErrorCount > SESSION_ERROR_LIMIT) {
        return null; // Drop event — session limit reached
      }

      // Improve grouping for Matrix API errors.
      // MatrixError objects carry an `errcode` (e.g. M_FORBIDDEN, M_NOT_FOUND) — use it to
      // split errors into meaningful issue groups rather than merging them all by stack trace.
      const originalException = hint?.originalException;
      if (
        originalException !== null &&
        typeof originalException === 'object' &&
        'errcode' in originalException &&
        typeof (originalException as Record<string, unknown>).errcode === 'string'
      ) {
        const errcode = (originalException as Record<string, unknown>).errcode as string;
        // Preserve default grouping AND split by errcode
        // eslint-disable-next-line no-param-reassign
        event.fingerprint = ['{{ default }}', errcode];
      }

      // Scrub sensitive data from error messages and exception values using shared helpers
      if (event.message) {
        // eslint-disable-next-line no-param-reassign
        event.message = scrubMatrixIds(event.message);
      }

      // Scrub sensitive data from exception values
      if (event.exception?.values) {
        event.exception.values.forEach((exception) => {
          if (exception.value) {
            // eslint-disable-next-line no-param-reassign
            exception.value = scrubMatrixUrl(scrubMatrixIds(exception.value));
          }
        });
      }

      // Scrub contexts (e.g. debugLog context from captureMessage in debugLogger.ts,
      // which can carry structured data fields like roomId, targetEventId, etc.)
      if (event.contexts) {
        // eslint-disable-next-line no-param-reassign
        event.contexts = scrubDataObject(event.contexts) as typeof event.contexts;
      }

      // Scrub request data
      if (event.request?.url) {
        // eslint-disable-next-line no-param-reassign
        event.request.url = scrubMatrixUrl(
          event.request.url.replace(
            /(access_token|password|token)([=:]\s*)([^\s&]+)/gi,
            '$1$2[REDACTED]'
          )
        );
      }

      // Scrub the transaction name on error events (set when the error occurred during a
      // page-load or navigation transaction — raw URL leaks here when route matching fails)
      if (event.transaction) {
        // eslint-disable-next-line no-param-reassign
        event.transaction = scrubMatrixUrl(event.transaction);
      }

      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>;
        if (headers.Authorization) {
          headers.Authorization = '[REDACTED]';
        }
      }

      return event;
    },
  });

  // Expose Sentry globally for debugging and console testing
  // Set app-wide attributes on the global scope so they appear on all events and logs
  Sentry.getGlobalScope().setAttributes({
    'app.name': 'sable',
    'app.version': release ?? 'unknown',
  });

  // Tag all events with the PR number when running in a PR preview deployment
  const prNumber = import.meta.env.VITE_SENTRY_PR;
  if (prNumber) {
    Sentry.getGlobalScope().setTag('pr', prNumber);
  }

  // @ts-expect-error - Adding to window for debugging
  window.Sentry = Sentry;

  // eslint-disable-next-line no-console
  console.info(
    `[Sentry] Initialized for ${environment} environment${replayEnabled ? ' with Session Replay' : ''}`
  );
  // eslint-disable-next-line no-console
  console.info(`[Sentry] DSN configured: ${dsn?.substring(0, 30)}...`);
  // eslint-disable-next-line no-console
  console.info(`[Sentry] Release: ${release || 'not set'}`);
} else if (!sentryEnabled) {
  // eslint-disable-next-line no-console
  console.info('[Sentry] Disabled by user preference');
} else {
  // eslint-disable-next-line no-console
  console.info('[Sentry] Disabled - no DSN provided');
}

// Export Sentry for use in other parts of the application
export { Sentry };
