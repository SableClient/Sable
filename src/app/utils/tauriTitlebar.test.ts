import { describe, expect, it } from 'vitest';
import { getCustomTitlebarKind } from './tauriTitlebar';

describe('getCustomTitlebarKind', () => {
  it('renders the matching custom title bar when enabled', () => {
    expect(getCustomTitlebarKind(true, 'windows')).toBe('desktop');
    expect(getCustomTitlebarKind(true, 'linux')).toBe('desktop');
    expect(getCustomTitlebarKind(true, 'macos')).toBe('mac');
  });

  it('keeps native chrome when disabled or outside desktop Tauri', () => {
    expect(getCustomTitlebarKind(false, 'windows')).toBeNull();
    expect(getCustomTitlebarKind(false, 'macos')).toBeNull();
    expect(getCustomTitlebarKind(true, undefined)).toBeNull();
    expect(getCustomTitlebarKind(true, 'android')).toBeNull();
  });
});
