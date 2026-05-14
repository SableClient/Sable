import { describe, expect, it } from 'vitest';

import {
  APPROVED_THEME_PREFIX_ALLOW_ALL,
  isApprovedCatalogHostUrl,
  isThirdPartyThemeUrl,
} from './themeApproval';

describe('themeApproval', () => {
  describe('isApprovedCatalogHostUrl', () => {
    const officialUrl = 'https://raw.githubusercontent.com/SableClient/themes/main/foo.sable.css';

    it('undefined or empty ⇒ no approvals', () => {
      expect(isApprovedCatalogHostUrl(officialUrl, undefined)).toBe(false);
      expect(isApprovedCatalogHostUrl(officialUrl, [])).toBe(false);
    });

    it('matching prefix ⇒ approved', () => {
      expect(
        isApprovedCatalogHostUrl(officialUrl, [
          'https://raw.githubusercontent.com/SableClient/themes/',
        ])
      ).toBe(true);
    });

    it('prefix mismatch ⇒ not approved', () => {
      expect(isApprovedCatalogHostUrl(officialUrl, ['https://evil.example/'])).toBe(false);
    });

    it('wildcard * ⇒ any https approved', () => {
      expect(
        isApprovedCatalogHostUrl('https://any.host/file.sable.css', [
          APPROVED_THEME_PREFIX_ALLOW_ALL,
        ])
      ).toBe(true);
      expect(
        isApprovedCatalogHostUrl('http://mixed.example/file', [APPROVED_THEME_PREFIX_ALLOW_ALL])
      ).toBe(false);
    });

    it('whitespace trims wildcard and prefixes', () => {
      expect(
        isApprovedCatalogHostUrl('https://x/foo', [`  ${APPROVED_THEME_PREFIX_ALLOW_ALL}  `])
      ).toBe(true);
      expect(isApprovedCatalogHostUrl(officialUrl, ['  https://raw.githubusercontent.com/'])).toBe(
        true
      );
    });
  });

  describe('isThirdPartyThemeUrl', () => {
    const url = 'https://evil.example/theme.sable.css';

    it('non-https is not third-party (no badge semantics)', () => {
      expect(isThirdPartyThemeUrl('ftp://evil.example/foo', undefined)).toBe(false);
    });

    it('https with no prefixes is third-party', () => {
      expect(isThirdPartyThemeUrl(url, undefined)).toBe(true);
      expect(isThirdPartyThemeUrl(url, [])).toBe(true);
    });

    it('https on allow list is not third-party', () => {
      expect(isThirdPartyThemeUrl(url, ['https://evil.example/'])).toBe(false);
    });

    it('wildcard suppresses third-party', () => {
      expect(isThirdPartyThemeUrl(url, [APPROVED_THEME_PREFIX_ALLOW_ALL])).toBe(false);
    });
  });
});
