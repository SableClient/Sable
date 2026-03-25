/**
 * Pure scrubbing helpers shared by the Sentry instrumentation layer.
 *
 * Extracted from src/instrument.ts so they can be unit-tested independently
 * of the Sentry initialisation side-effects.
 */

/**
 * Scrub Matrix entity IDs and credential tokens from a plain string value.
 * Handles the sigil-prefixed forms: !roomId:server, @userId:server, $eventId,
 * #alias:server, and common credential token query-string / JSON patterns.
 * Used for structured log attribute values and breadcrumb data fields.
 */
export function scrubMatrixIds(value: string): string {
  return value
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

/**
 * Scrub Matrix-specific identifiers from URLs that appear in Sentry spans, breadcrumbs,
 * transaction names, and page URLs. Covers both Matrix API paths and client-side app routes.
 * Room IDs, user IDs, event IDs, media paths, and deep-link parameters are replaced with
 * safe placeholders so no PII leaks into Sentry.
 */
export function scrubMatrixUrl(url: string): string {
  return (
    url
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
      // ── Preview URL endpoint ────────────────────────────────────────────────────────
      // The ?url= query parameter on preview_url contains the full external URL being
      // previewed — strip the entire query string so browsing habits cannot be inferred.
      .replace(/(\/preview_url)\?[^#\s]*/gi, '$1')
  );
}
