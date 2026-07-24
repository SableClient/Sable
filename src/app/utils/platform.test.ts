import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getAppOrigin } from './platform';
import { isTauri } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn<() => boolean>(),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: vi.fn<() => string>(() => 'windows'),
}));

describe('getAppOrigin', () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns https://app.sable.moe when running inside Tauri', () => {
    vi.mocked(isTauri).mockReturnValue(true);
    expect(getAppOrigin()).toBe('https://app.sable.moe');
  });

  it('returns https://app.sable.moe when hostname is tauri.localhost', () => {
    vi.stubGlobal('location', {
      origin: 'http://tauri.localhost',
      hostname: 'tauri.localhost',
      protocol: 'http:',
      host: 'tauri.localhost',
    });
    expect(getAppOrigin()).toBe('https://app.sable.moe');
  });

  it('returns window.location.origin in normal web environment', () => {
    vi.stubGlobal('location', {
      origin: 'https://app.sable.moe',
      hostname: 'app.sable.moe',
      protocol: 'https:',
      host: 'app.sable.moe',
    });
    expect(getAppOrigin()).toBe('https://app.sable.moe');
  });
});
