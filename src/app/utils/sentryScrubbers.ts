/**
 * Pure scrubbing helpers shared by the Sentry instrumentation layer.
 *
 * Extracted from src/instrument.ts so they can be unit-tested independently
 * of the Sentry initialisation side-effects.
 */

/** Hosts that identify the app shell, not a user's homeserver. Never redacted. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'tauri.localhost']);

// Also preserve the app's own origin so Sentry can show which page an error occurred on.
if (typeof window !== 'undefined' && window.location) {
  try {
    const appHost = new URL(window.location.origin).hostname.toLowerCase();
    if (appHost) LOCAL_HOSTS.add(appHost);
  } catch {
    /* invalid origin, ignore */
  }
}

/** Replace the origin of any external http(s) URL with [HOMESERVER], keeping path/query/hash. */
export function scrubExternalHosts(value: string): string {
  return value.replace(/\bhttps?:\/\/[^/?#\s]+/gi, (match) => {
    const schemeEnd = match.indexOf('://') + 3;
    const hostname = (match.slice(schemeEnd).split(':')[0] ?? '').toLowerCase();
    if (LOCAL_HOSTS.has(hostname)) return match;
    return `${match.slice(0, schemeEnd)}[HOMESERVER]`;
  });
}

/**
 * Scrub Matrix entity IDs, credential tokens, and external http(s) hosts from a
 * plain string value. Used for structured log attribute values and breadcrumb
 * data fields.
 */
export function scrubMatrixIds(value: string): string {
  return scrubExternalHosts(value)
    .replace(
      /(access_token|password|token|refresh_token|session_id|sync_token|next_batch)([=:\s]+)([^\s&]+)/gi,
      '$1$2[REDACTED]'
    )
    .replace(/@[^\s:@]+:[^\s,'"(){}[\]]+/g, '@[USER_ID]')
    .replace(/![^\s:]+:[^\s,'"(){}[\]]+/g, '![ROOM_ID]')
    .replace(/#[^\s:@]+:[^\s,'"(){}[\]]+/g, '#[ROOM_ALIAS]')
    .replace(/\$[A-Za-z0-9_+/-]{10,}/g, '$[EVENT_ID]');
}

/**
 * Recursively scrub Matrix entity IDs from all string values in a plain object.
 * Handles one level of nesting (objects and arrays of primitives).
 */
export function scrubDataObject(data: unknown): unknown {
  if (typeof data === 'string') return scrubMatrixIds(data);
  if (Array.isArray(data)) return data.map(scrubDataObject);
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, scrubDataObject(v)])
    );
  }
  return data;
}

/** Structured fields that should never be sent to Sentry, even redacted. */
const SENTRY_IDENTIFIER_KEYS = new Set([
  'roomId',
  'notificationEventId',
  'refEventId',
  'senderId',
  'declineEventId',
  'eventId',
  'userId',
  'targetEventId',
  'deviceId',
  'activeNotificationId',
  'activeRefEventId',
  'callerId',
  'recipientId',
]);

/** Drop identifier-bearing keys before values are scrubbed for Sentry export. */
export function omitSentryIdentifierFields(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(omitSentryIdentifierFields);
  }
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter(([key]) => !SENTRY_IDENTIFIER_KEYS.has(key))
        .map(([key, value]) => [key, omitSentryIdentifierFields(value)])
    );
  }
  return data;
}

/** Full sanitization pass for Sentry breadcrumbs, logs, and contexts. */
export function sanitizeSentryPayload(data: unknown): unknown {
  return scrubDataObject(omitSentryIdentifierFields(data));
}

/**
 * Scrub Matrix-specific identifiers from URLs that appear in Sentry spans, breadcrumbs,
 * transaction names, and page URLs. Covers both Matrix API paths and client-side app routes.
 * Room IDs, user IDs, event IDs, media paths, and deep-link parameters are replaced with
 * safe placeholders so no PII leaks into Sentry.
 */
export function scrubMatrixUrl(url: string): string {
  return (
    scrubExternalHosts(url)
      // ── Matrix Client-Server API paths ──────────────────────────────────────────────
      // /rooms/!roomId:server/...
      .replace(/\/rooms\/![^/?#\s]*/g, '/rooms/![ROOM_ID]')
      // /event/$eventId and /relations/$eventId
      .replace(/\/event\/(?:\$|%24)[^/?#\s]*/g, '/event/$[EVENT_ID]')
      .replace(/\/relations\/(?:\$|%24)[^/?#\s]*/g, '/relations/$[EVENT_ID]')
      // /profile/@user:server  or  /profile/%40user%3Aserver
      .replace(/\/profile\/(?:%40|@)[^/?#\s]*/gi, '/profile/[USER_ID]')
      // /user/@user:server/...  and  /presence/@user:server/status
      .replace(/\/(user|presence)\/(?:%40|@)[^/?#\s]*/gi, '/$1/[USER_ID]')
      // /room_keys/keys/{version}/{roomId}/{sessionId}
      .replace(/\/room_keys\/keys\/[^/?#\s]*/gi, '/room_keys/keys/[REDACTED]')
      // /sendToDevice/{eventType}/{txnId}
      .replace(/\/sendToDevice\/([^/?#\s]+)\/[^/?#\s]+/gi, '/sendToDevice/$1/[TXN_ID]')
      // Media – MSC3916 (/media/thumbnail|download/{server}/{mediaId}) and legacy (v1/v3)
      .replace(
        /(\/media\/(?:thumbnail|download)\/)(?:[^/?#\s]+)\/(?:[^/?#\s]+)/gi,
        '$1[SERVER]/[MEDIA_ID]'
      )
      .replace(
        /(\/media\/v\d+\/(?:thumbnail|download)\/)(?:[^/?#\s]+)\/(?:[^/?#\s]+)/gi,
        '$1[SERVER]/[MEDIA_ID]'
      )
      // ── App route path segments ─────────────────────────────────────────────────────
      // Bare/partially-decoded Matrix IDs in URL path segments.
      // Browsers decode %21→! and %40→@ for display but often keep %3A encoded,
      // so we see hybrid forms like /!localpart%3Aserver/ or /!localpart:server/.
      // Each pattern accepts either a literal colon or the %3A encoding.
      // Bare room IDs: /!localpart:server/ or /!localpart%3Aserver/
      .replace(/\/![^/?#\s:%]+(?:%3A|:)[^/?#\s]*/gi, '/![ROOM_ID]')
      // Bare user IDs: /@user:server/ or /@user%3Aserver/
      .replace(/\/@[^/?#\s:%]+(?:%3A|:)[^/?#\s]*/gi, '/@[USER_ID]')
      // Bare room aliases: /#alias:server/ or /#alias%3Aserver/
      .replace(/\/#[^/?#\s:%]+(?:%3A|:)[^/?#\s]*/gi, '/[ROOM_ALIAS]')
      // ── Deep-link / app-route URLs (percent-encoded via encodeURIComponent) ─────────
      // URL-encoded user IDs: /%40user%3Aserver  (%40 = @)
      .replace(/\/%40[^/?#\s]*/gi, '/[USER_ID]')
      // URL-encoded room IDs: /%21room%3Aserver  (%21 = !)
      .replace(/\/%21[^/?#\s]*/gi, '/![ROOM_ID]')
      // URL-encoded room aliases: /%23alias%3Aserver  (%23 = #)
      // App routes like /:spaceIdOrAlias/ use encodeURIComponent() so #alias:server
      // appears as %23alias%3Aserver in the URL path / Sentry transaction name.
      .replace(/\/%23[^/?#\s]*/gi, '/[ROOM_ALIAS]')
      // URL-encoded event IDs as bare path segments: /%24eventId  (%24 = $)
      .replace(/\/%24[^/?#\s]*/gi, '/[EVENT_ID]')
      //  Opaque Matrix IDs with percent-encoded colon (%3A)
      // Catches device IDs, filter tokens, and other bare Matrix IDs that lack a sigil
      // prefix but still follow the localpart%3Aserver pattern in URL paths.
      // e.g. /Gj3Wy2D8gAi8jTIyR%3Asable.moe  (decoded: Gj3Wy2D8gAi8jTIyR:sable.moe)
      .replace(/\/[A-Za-z0-9+_-]{5,}%3A[A-Za-z0-9._-]+[^/?#\s]*/gi, '/[MATRIX_ID]')
      // ── Long opaque base64url path segments (access tokens, crypto keys, push tokens) ─
      // Catches 30+ character base64url strings that appear as standalone path segments.
      // These are typically Curve25519 keys, MSC3575 session tokens, or push endpoints.
      // e.g. /vI02CuiDNpaYEhUIVLbqE8vdKqm2ZwqIR5Y6NwNY_Rg/
      // Runs last so earlier patterns already replaced known Matrix IDs.
      .replace(/\/[A-Za-z0-9+_-]{30,}(\/|$)/g, '/[REDACTED]$1')
      // ── Preview URL endpoint ────────────────────────────────────────────────────────
      // The ?url= query parameter on preview_url contains the full external URL being
      // previewed — strip the entire query string so browsing habits cannot be inferred.
      .replace(/(\/preview_url)\?[^#\s]*/gi, '$1')
      // ── Auth callback credentials ────────────────────────────────────────────────────
      // OAuth code/state and the legacy SSO loginToken are single-use login credentials.
      .replace(/([?&#](?:code|state|loginToken)=)[^&#\s]+/gi, '$1[REDACTED]')
  );
}

type DiagnosticsJsonValue =
  | null
  | boolean
  | number
  | string
  | DiagnosticsJsonObject
  | DiagnosticsJsonValue[];
type DiagnosticsJsonObject = { [key: string]: DiagnosticsJsonValue };

const DIAGNOSTICS_REDACTED = '[REDACTED]';
const DIAGNOSTICS_REDACTED_CREDENTIAL = '[REDACTED_CREDENTIAL]';
const DIAGNOSTICS_REDACTED_MATRIX_ID = '[REDACTED_MATRIX_ID]';
const DIAGNOSTICS_REDACTED_PATH = '[REDACTED_PATH]';
const DIAGNOSTICS_REDACTED_URL = '[REDACTED_URL]';

const DIAGNOSTICS_SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|token|secret|password|passwd|credential|api[-_]?key)/i;
const DIAGNOSTICS_URL_PATTERN = /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s<>"']+/gi;
const DIAGNOSTICS_AUTH_PATTERN = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const DIAGNOSTICS_SENSITIVE_VALUE_PATTERN =
  /(["']?(?:authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|access[-_]?token|refresh[-_]?token|id[-_]?token|x[-_]?auth[-_]?token|x[-_]?access[-_]?token|api[-_]?key|client[-_]?secret|password|passwd|secret|credential|token)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi;
const DIAGNOSTICS_MATRIX_ID_PATTERN = /(?:[@!#$]\S+?:\S+|\$\S+?:\S+)/g;
const DIAGNOSTICS_ABSOLUTE_PATH_PATTERN =
  /(?:\/(?:home|Users|tmp|var\/tmp|private\/tmp|var\/folders)\/[^\s<>"']+|[A-Za-z]:[\\/](?:Users|Temp|Windows[\\/]Temp)[^\s<>"']*)/g;

const redactDiagnosticsText = (text: string): string =>
  text
    .replace(DIAGNOSTICS_URL_PATTERN, DIAGNOSTICS_REDACTED_URL)
    .replace(DIAGNOSTICS_AUTH_PATTERN, DIAGNOSTICS_REDACTED_CREDENTIAL)
    .replace(DIAGNOSTICS_SENSITIVE_VALUE_PATTERN, `$1${DIAGNOSTICS_REDACTED}`)
    .replace(DIAGNOSTICS_MATRIX_ID_PATTERN, DIAGNOSTICS_REDACTED_MATRIX_ID)
    .replace(DIAGNOSTICS_ABSOLUTE_PATH_PATTERN, DIAGNOSTICS_REDACTED_PATH);

const sanitizeDiagnosticsHeaders = (value: DiagnosticsJsonValue): DiagnosticsJsonValue => {
  if (Array.isArray(value)) {
    return value.map((header) => {
      if (Array.isArray(header) && header.length >= 2) {
        return [
          typeof header[0] === 'string' ? redactDiagnosticsText(header[0]) : 'header',
          DIAGNOSTICS_REDACTED,
        ];
      }
      return sanitizeDiagnosticsJsonValue(header) ?? null;
    });
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).map((key) => [key, DIAGNOSTICS_REDACTED]));
  }
  return sanitizeDiagnosticsJsonValue(value) ?? null;
};

const sanitizeDiagnosticsJsonValue = (
  value: DiagnosticsJsonValue
): DiagnosticsJsonValue | undefined => {
  if (typeof value === 'string') return redactDiagnosticsText(value);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value))
    return value.map(sanitizeDiagnosticsJsonValue).filter((item) => item !== undefined);

  const sanitized: DiagnosticsJsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === 'data') continue;
    if (key.toLowerCase() === 'headers') {
      sanitized[key] = sanitizeDiagnosticsHeaders(child);
      continue;
    }
    if (DIAGNOSTICS_SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = DIAGNOSTICS_REDACTED;
      continue;
    }
    const safeChild = sanitizeDiagnosticsJsonValue(child);
    if (safeChild !== undefined) sanitized[key] = safeChild;
  }
  return sanitized;
};

/** Strict sanitizer for frontend diagnostics exports sent from the web client. */
export const sanitizeDiagnosticsLogs = (rawLogs: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(rawLogs);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const sanitized = sanitizeDiagnosticsJsonValue(parsed as DiagnosticsJsonObject);
    return sanitized === undefined ? null : JSON.stringify(sanitized, null, 2);
  } catch {
    return null;
  }
};
