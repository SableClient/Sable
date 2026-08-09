import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getAppOrigin, getWindowOrigin, isMobileOrTablet, ua } from './platform';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

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

describe('isMobileOrTablet', () => {
  const originalDeviceType = ua.device.type;
  const originalOsName = ua.os.name;

  afterEach(() => {
    ua.device.type = originalDeviceType;
    ua.os.name = originalOsName;
  });

  it('uses the desktop Tauri OS instead of a mobile-looking WebView user agent', () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(osType).mockReturnValue('windows');
    ua.device.type = 'mobile';
    ua.os.name = 'Android';

    expect(isMobileOrTablet()).toBe(false);
  });
});

describe('getWindowOrigin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the real tauri:// origin when window.location.origin is the opaque "null"', () => {
    vi.stubGlobal('location', {
      origin: 'null',
      hostname: 'localhost',
      protocol: 'tauri:',
      host: 'localhost',
    });
    expect(getWindowOrigin()).toBe('tauri://localhost');
  });

  it('returns window.location.origin in a normal web environment', () => {
    vi.stubGlobal('location', {
      origin: 'https://app.example.com',
      hostname: 'app.example.com',
      protocol: 'https:',
      host: 'app.example.com',
    });
    expect(getWindowOrigin()).toBe('https://app.example.com');
  });
});
