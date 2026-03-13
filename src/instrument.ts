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

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;
const release = import.meta.env.VITE_APP_VERSION;

// Check user preferences
const sentryEnabled = localStorage.getItem('sable_sentry_enabled') !== 'false';
const replayEnabled = localStorage.getItem('sable_sentry_replay_enabled') !== 'false';

// Only initialize if DSN is provided and user hasn't opted out
if (dsn && sentryEnabled) {
  Sentry.init({
    dsn,
    environment,
    release,

    // Send default PII (IP addresses) for user context
    // Set to false if more privacy is required
    sendDefaultPii: true,

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
    ],

    // Performance Monitoring - Tracing
    // 100% in development, lower in production for cost control
    tracesSampleRate: environment === 'development' ? 1.0 : 0.1,

    // Control which URLs get distributed tracing headers
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/[^/]*\.sable\.chat/,
      // Add your Matrix homeserver domains here if needed
    ],

    // Session Replay sampling
    // Record 100% in development for testing, 10% in production
    // Always record 100% of sessions with errors
    replaysSessionSampleRate: environment === 'development' ? 1.0 : 0.1,
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
        if (sensitivePatterns.some((pattern) => breadcrumb.message?.toLowerCase().includes(pattern))) {
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
  console.info(
    `[Sentry] DSN configured: ${dsn?.substring(0, 30)}...`
  );
  // eslint-disable-next-line no-console
  console.info(
    `[Sentry] Release: ${release || 'not set'}`
  );
} else if (!sentryEnabled) {
  // eslint-disable-next-line no-console
  console.info('[Sentry] Disabled by user preference');
} else {
  // eslint-disable-next-line no-console
  console.info('[Sentry] Disabled - no DSN provided');
}

// Export Sentry for use in other parts of the application
export { Sentry };
