// oxlint-disable typescript/no-explicit-any
import { describe, expect, it, vi, afterEach } from 'vitest';

const hoistedGetSessionScope = vi.hoisted(() => vi.fn<() => string>(() => 'session_abc'));
const hoistedIsTauri = vi.hoisted(() => vi.fn<() => boolean>(() => false));
const hoistedConvertFileSrc = vi.hoisted(() =>
  vi.fn<(url: string, protocol: string) => string>(
    (url: string, protocol: string) => `${protocol}://${url}`
  )
);

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: hoistedIsTauri,
  convertFileSrc: hoistedConvertFileSrc,
}));

vi.mock('./mediaTransport', () => ({
  getCurrentMediaSessionScope: hoistedGetSessionScope,
}));

import { rewriteAuthenticatedMediaUrl } from './mediaUrl';

afterEach(() => {
  hoistedIsTauri.mockReset();
  hoistedIsTauri.mockReturnValue(false);
  hoistedGetSessionScope.mockReset();
  hoistedGetSessionScope.mockReturnValue('session_abc');
});

const VERSION_SNIPPET = '__sable_media_cache=3';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('rewriteAuthenticatedMediaUrl', () => {
  describe('non-Tauri passthrough', () => {
    it('returns the URL unchanged when not in Tauri', () => {
      const url = 'https://matrix.example.com/_matrix/media/v3/download/example.com/abc123';
      expect(rewriteAuthenticatedMediaUrl(url)).toBe(url);
    });

    it('returns null for null input (non-Tauri)', () => {
      expect(rewriteAuthenticatedMediaUrl(null)).toBeNull();
    });
  });

  describe('null / falsy input', () => {
    it('returns null for null input in Tauri', () => {
      hoistedIsTauri.mockReturnValue(true);
      expect(rewriteAuthenticatedMediaUrl(null)).toBeNull();
    });
  });

  describe('authenticated prefix rewriting (Tauri)', () => {
    const prefixes = [
      '/_matrix/client/v1/media/',
      '/_matrix/media/v3/download/',
      '/_matrix/media/v3/thumbnail/',
      '/_matrix/media/r0/download/',
      '/_matrix/media/r0/thumbnail/',
    ];

    it.each(prefixes)('rewrites URLs starting with %s', (prefix) => {
      hoistedIsTauri.mockReturnValue(true);
      const url = `https://matrix.example.com${prefix}example.com/abc123`;
      const result = rewriteAuthenticatedMediaUrl(url);
      expect(result).not.toBeNull();
      expect(result).toContain('sable-media://');
      expect(result).toContain(VERSION_SNIPPET);
      expect(result).toContain('__sable_media_session=session_abc');
    });
  });

  describe('idempotency', () => {
    it('returns an already-rewritten URL unchanged', () => {
      hoistedIsTauri.mockReturnValue(true);
      const url = 'https://matrix.example.com/_matrix/media/v3/download/example.com/abc123';
      const first = rewriteAuthenticatedMediaUrl(url) as string;
      const second = rewriteAuthenticatedMediaUrl(first);
      expect(second).toBe(first);
    });

    it('returns an already-rewritten sable-media:// URL unchanged', () => {
      hoistedIsTauri.mockReturnValue(true);
      const alreadyRewritten =
        'sable-media://https://matrix.example.com/_matrix/media/v3/download/example.com/abc123';
      const withVersion = `${alreadyRewritten}?${VERSION_SNIPPET}&__sable_media_session=session_abc`;
      expect(rewriteAuthenticatedMediaUrl(withVersion)).toBe(withVersion);
    });
  });

  describe('session scoping', () => {
    it('includes a session-scoped token in the rewritten URL', () => {
      hoistedIsTauri.mockReturnValue(true);
      const url = 'https://matrix.example.com/_matrix/media/v3/download/example.com/abc123';
      const result = rewriteAuthenticatedMediaUrl(url);
      expect(result).toContain('__sable_media_session=session_abc');
    });

    it('produces different URLs for different session scopes', () => {
      hoistedIsTauri.mockReturnValue(true);
      const url = 'https://matrix.example.com/_matrix/media/v3/download/example.com/abc123';

      hoistedGetSessionScope.mockReturnValue('session_alice');
      const aliceUrl = rewriteAuthenticatedMediaUrl(url);

      hoistedGetSessionScope.mockReturnValue('session_bob');
      const bobUrl = rewriteAuthenticatedMediaUrl(url);

      expect(aliceUrl).not.toBeNull();
      expect(bobUrl).not.toBeNull();
      expect(aliceUrl).not.toEqual(bobUrl);
      expect(aliceUrl).toContain('__sable_media_session=session_alice');
      expect(bobUrl).toContain('__sable_media_session=session_bob');
    });
  });

  describe('non-media URLs', () => {
    it('leaves non-Matrix URLs unchanged in Tauri', () => {
      hoistedIsTauri.mockReturnValue(true);
      const url = 'https://example.com/some/image.png';
      expect(rewriteAuthenticatedMediaUrl(url)).toBe(url);
    });

    it('leaves invalid URLs unchanged', () => {
      hoistedIsTauri.mockReturnValue(true);
      const url = 'not-a-url';
      expect(rewriteAuthenticatedMediaUrl(url)).toBe(url);
    });

    it('leaves non-http/https protocol URLs unchanged', () => {
      hoistedIsTauri.mockReturnValue(true);
      const url = 'ftp://matrix.example.com/_matrix/media/v3/download/example.com/abc123';
      expect(rewriteAuthenticatedMediaUrl(url)).toBe(url);
    });
  });
});
