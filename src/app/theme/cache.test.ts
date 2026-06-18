import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearStoredAppliedThemeCss,
  clearStoredAppliedTweakCss,
  getStoredAppliedThemeCss,
  getStoredAppliedTweakCss,
  putStoredAppliedThemeCss,
  putStoredAppliedTweakCss,
} from './cache';

describe('theme cache local snapshots', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStoredAppliedThemeCss();
    clearStoredAppliedTweakCss();
  });

  it('returns stored applied theme css only for the matching url', () => {
    putStoredAppliedThemeCss(' https://themes.example/dark.css ', 'body { color: red; }');

    expect(getStoredAppliedThemeCss('https://themes.example/dark.css')).toBe(
      'body { color: red; }'
    );
    expect(getStoredAppliedThemeCss('https://themes.example/light.css')).toBeUndefined();
  });

  it('returns stored applied tweak css only for the matching ordered url set', () => {
    putStoredAppliedTweakCss(
      [' https://themes.example/a.css ', 'https://themes.example/b.css'],
      'body { color: blue; }'
    );

    expect(
      getStoredAppliedTweakCss(['https://themes.example/a.css', 'https://themes.example/b.css'])
    ).toBe('body { color: blue; }');
    expect(
      getStoredAppliedTweakCss(['https://themes.example/b.css', 'https://themes.example/a.css'])
    ).toBeUndefined();
  });

  it('ignores malformed stored tweak url data', () => {
    localStorage.setItem(
      'sable_applied_remote_tweaks_css',
      JSON.stringify({
        urls: 'https://themes.example/a.css',
        cssText: 'body { color: blue; }',
        cachedAt: Date.now(),
      })
    );

    expect(() => getStoredAppliedTweakCss(['https://themes.example/a.css'])).not.toThrow();
    expect(getStoredAppliedTweakCss(['https://themes.example/a.css'])).toBeUndefined();
  });

  it('ignores non-string tweak url entries from malformed storage', () => {
    localStorage.setItem(
      'sable_applied_remote_tweaks_css',
      JSON.stringify({
        urls: ['https://themes.example/a.css', 42, null],
        cssText: 'body { color: blue; }',
        cachedAt: Date.now(),
      })
    );

    expect(() => getStoredAppliedTweakCss(['https://themes.example/a.css'])).not.toThrow();
    expect(getStoredAppliedTweakCss(['https://themes.example/a.css'])).toBe(
      'body { color: blue; }'
    );
  });
});
