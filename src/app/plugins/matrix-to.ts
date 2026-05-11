export let MATRIX_TO_BASE = 'https://matrix.to/';

/**
 * Override the default matrix.to base URL (configurable per deployment).
 * Must be called before any getMatrixTo* functions are used.
 */
export const setMatrixToBase = (baseUrl?: string): void => {
  MATRIX_TO_BASE = baseUrl ? baseUrl.replace(/\/?$/, '/') : 'https://matrix.to/';
};

export const getMatrixToUser = (userId: string): string => `${MATRIX_TO_BASE}#/${userId}`;

const withViaServers = (fragment: string, viaServers: string[]): string =>
  `${fragment}?${viaServers.map((server) => `via=${server}`).join('&')}`;

export const getMatrixToRoom = (roomIdOrAlias: string, viaServers?: string[]): string => {
  let fragment = roomIdOrAlias;

  if (Array.isArray(viaServers) && viaServers.length > 0) {
    fragment = withViaServers(fragment, viaServers);
  }

  return `${MATRIX_TO_BASE}#/${fragment}`;
};

export const getMatrixToRoomEvent = (
  roomId: string,
  eventId: string,
  viaServers?: string[]
): string => {
  let fragment = `${roomId}/${eventId}`;

  if (Array.isArray(viaServers) && viaServers.length > 0) {
    fragment = withViaServers(fragment, viaServers);
  }

  return `${MATRIX_TO_BASE}#/${fragment}`;
};

export type MatrixToRoom = {
  roomIdOrAlias: string;
  viaServers?: string[];
};

export type MatrixToRoomEvent = MatrixToRoom & {
  eventId: string;
};

const escapeForRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lazily cached regex set; rebuilt if MATRIX_TO_BASE changes.
let cachedRegexBase = '';
let cachedRegexes: {
  any: RegExp;
  user: RegExp;
  room: RegExp;
  event: RegExp;
} | null = null;

/**
 * Returns regexes that match BOTH https://matrix.to (for cross-client links
 * received from standard clients) and the configured custom base URL (if any).
 */
const getMatchRegexes = () => {
  if (cachedRegexBase === MATRIX_TO_BASE && cachedRegexes) return cachedRegexes;
  cachedRegexBase = MATRIX_TO_BASE;
  // Use https? so both http:// and https://matrix.to are accepted (original behaviour).
  const standard = `https?://${escapeForRegex('matrix.to/')}`;
  const b =
    MATRIX_TO_BASE !== 'https://matrix.to/'
      ? `(?:${standard}|${escapeForRegex(MATRIX_TO_BASE)})`
      : standard;
  cachedRegexes = {
    any: new RegExp(`^${b}\\S*$`),
    user: new RegExp(`^${b}#/(@[^:\\s]+:[^?/\\s]+)\\/?$`),
    room: new RegExp(`^${b}#/([#!][^?/\\s]+)\\/?(\\?[\\S]*)?$`),
    event: new RegExp(`^${b}#/([#!][^?/\\s]+)/(\\$[^?/\\s]+)\\/?([?\\S]*)?$`),
  };
  return cachedRegexes;
};

export const testMatrixTo = (href: string): boolean => getMatchRegexes().any.test(href);

export const parseMatrixToUser = (href: string): string | undefined => {
  const match = href.match(getMatchRegexes().user);
  if (!match) return undefined;
  return match[1];
};

export const parseMatrixToRoom = (href: string): MatrixToRoom | undefined => {
  const match = href.match(getMatchRegexes().room);
  if (!match) return undefined;

  const roomIdOrAlias = match[1];
  const viaSearchStr = match[2];
  if (!roomIdOrAlias) return undefined;
  const viaServers = viaSearchStr ? new URLSearchParams(viaSearchStr).getAll('via') : [];

  return {
    roomIdOrAlias,
    viaServers: viaServers.length === 0 ? undefined : viaServers,
  };
};

export const parseMatrixToRoomEvent = (href: string): MatrixToRoomEvent | undefined => {
  const match = href.match(getMatchRegexes().event);
  if (!match) return undefined;

  const roomIdOrAlias = match[1];
  const eventId = match[2];
  const viaSearchStr = match[3];
  if (!roomIdOrAlias || !eventId) return undefined;
  const viaServers = viaSearchStr ? new URLSearchParams(viaSearchStr).getAll('via') : [];

  return {
    roomIdOrAlias,
    eventId,
    viaServers: viaServers.length === 0 ? undefined : viaServers,
  };
};

const tryDecodeUriComponent = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Normalized Matrix permalink fragment (path after `#/`, lowercased), for comparing href vs anchor text.
 */
export const matrixPermalinkFragmentKey = (url: string): string | undefined => {
  const trimmed = url.trim();
  const decoded = tryDecodeUriComponent(trimmed);
  const candidate = testMatrixTo(trimmed) ? trimmed : testMatrixTo(decoded) ? decoded : undefined;
  if (!candidate) return undefined;
  try {
    const u = new URL(candidate);
    const frag = u.hash.startsWith('#') ? u.hash.slice(1) : '';
    const key = frag.replace(/^\/+/u, '').replace(/\/+$/u, '').toLowerCase();
    return key || undefined;
  } catch {
    return undefined;
  }
};

/**
 * True when anchor text is empty or only repeats the same permalink as `href` (e.g. pasted full URL).
 */
export const isRedundantMatrixToAnchorText = (
  href: string,
  anchorText: string | undefined
): boolean => {
  if (anchorText == null || anchorText.trim() === '') return true;
  const keyHref = matrixPermalinkFragmentKey(href);
  if (!keyHref) return false;
  const t = anchorText.trim();
  const keyText =
    matrixPermalinkFragmentKey(t) ?? matrixPermalinkFragmentKey(tryDecodeUriComponent(t));
  if (!keyText) return false;
  return keyHref === keyText;
};
