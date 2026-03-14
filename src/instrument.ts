/**
 * Sentry instrumentation - MUST be imported first in the application lifecycle
 *
 * Configure via environment variables:
 * - VITE_SENTRY_DSN: Your Sentry DSN (required to enable Sentry)
 * - VITE_SENTRY_ENVIRONMENT: Environment name (defaults to MODE)
 * - VITE_APP_VERSION: Release version for tracking
 * - VITE_SENTRY_SAMPLE_RATE: Production sample rate for traces, profiles, and
 *   session replays (0.0–1.0, default 0.1). Ignored in development/preview,
 *   which always sample at 100%.
 */
import * as Sentry from '@sentry/react';
import React from 'react';
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom';

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;
const release = import.meta.env.VITE_APP_VERSION;

// Production sample rate — overrideable via VITE_SENTRY_SAMPLE_RATE (0.0–1.0)
const isDevOrPreview = environment === 'development' || environment === 'preview';
const rawSampleRate = parseFloat(import.meta.env.VITE_SENTRY_SAMPLE_RATE ?? '');
const productionSampleRate = Number.isFinite(rawSampleRate)
  ? Math.min(1, Math.max(0, rawSampleRate))
  : 0.1;
const sampleRate = isDevOrPreview ? 1.0 : productionSampleRate;

// Check user preferences
const sentryEnabled = localStorage.getItem('sable_sentry_enabled') !== 'false';
const replayEnabled = localStorage.getItem('sable_sentry_replay_enabled') !== 'false';

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
    // Production rate is set by VITE_SENTRY_SAMPLE_RATE (default 0.1)
    tracesSampleRate: sampleRate,

    // Profiling sample rate — decision made once per session
    // Production rate is set by VITE_SENTRY_SAMPLE_RATE (default 0.1)
    // Requires Document-Policy: js-profiling response header
    profileSessionSampleRate: sampleRate,

    // Control which URLs get distributed tracing headers
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/[^/]*\.sable\.chat/,
      // Add your Matrix homeserver domains here if needed
    ],

    // Session Replay sampling
    // Record 100% in development and preview for testing, otherwise use VITE_SENTRY_SAMPLE_RATE
    // Always record 100% of sessions with errors
    replaysSessionSampleRate: sampleRate,
    replaysOnErrorSampleRate: 1.0,

    // Enable structured logging to Sentry
    enableLogs: true,

    // Filter sensitive data before sending to Sentry
    beforeBreadcrumb(breadcrumb) {
      // Don't send breadcrumbs containing tokens, passwords, or sensitive Matrix data
      if (breadcrumb.message) {
        const sensitivePatterns = [
          'access_token',
          'password',
          'token',
          'refresh_token',
          'device_id',
          'session_id',
          'sync_token',
          'next_batch',
          'user_id',
          'room_id',
          'event_id',
          '@',
          '!',
          '$',
        ];
        if (
          sensitivePatterns.some((pattern) => breadcrumb.message?.toLowerCase().includes(pattern))
        ) {
          // Don't drop entirely, but sanitize
          return {
            ...breadcrumb,
            message: breadcrumb.message.replace(
              /(access_token|password|token|refresh_token|session_id|sync_token|next_batch)([=:]\s*)([^\s&]+)/gi,
              '$1$2[REDACTED]'
            ),
          };
        }
      }
      return breadcrumb;
    },

    beforeSend(event) {
      // Scrub sensitive data from error messages
      if (event.message) {
        if (
          event.message.includes('access_token') ||
          event.message.includes('password') ||
          event.message.includes('token')
        ) {
          // eslint-disable-next-line no-param-reassign
          event.message = event.message.replace(
            /(access_token|password|token|refresh_token|session_id|sync_token|next_batch)([=:]\s*)([^\s&]+)/gi,
            '$1$2[REDACTED]'
          );
        }
        // Redact Matrix IDs to protect user privacy
        // eslint-disable-next-line no-param-reassign
        event.message = event.message.replace(/@[^:]+:[^\s]+/g, '@[USER_ID]');
        // eslint-disable-next-line no-param-reassign
        event.message = event.message.replace(/![^:]+:[^\s]+/g, '![ROOM_ID]');
        // eslint-disable-next-line no-param-reassign
        event.message = event.message.replace(/\$[^:\s]+/g, '$[EVENT_ID]');
      }

      // Scrub sensitive data from exception values
      if (event.exception?.values) {
        event.exception.values.forEach((exception) => {
          if (exception.value) {
            // eslint-disable-next-line no-param-reassign
            exception.value = exception.value.replace(
              /(access_token|password|token|refresh_token|session_id|sync_token|next_batch)([=:]\s*)([^\s&]+)/gi,
              '$1$2[REDACTED]'
            );
            // Redact Matrix IDs
            // eslint-disable-next-line no-param-reassign
            exception.value = exception.value.replace(/@[^:]+:[^\s]+/g, '@[USER_ID]');
            // eslint-disable-next-line no-param-reassign
            exception.value = exception.value.replace(/![^:]+:[^\s]+/g, '![ROOM_ID]');
            // eslint-disable-next-line no-param-reassign
            exception.value = exception.value.replace(/\$[^:\s]+/g, '$[EVENT_ID]');
          }
        });
      }

      // Scrub request data
      if (event.request?.url) {
        // eslint-disable-next-line no-param-reassign
        event.request.url = event.request.url.replace(
          /(access_token|password|token)([=:]\s*)([^\s&]+)/gi,
          '$1$2[REDACTED]'
        );
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
