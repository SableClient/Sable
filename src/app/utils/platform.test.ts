import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAppOrigin, getWindowOrigin, isMobileOrTablet, ua } from './platform';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn<() => Promise<void>>(),
  isTauri: vi.fn<() => boolean>(),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: vi.fn<() => string>(() => 'windows'),
}));

const loadPlatform = async (os: string | undefined, userAgent: string) => {
  vi.mocked(isTauri).mockReturnValue(os !== undefined);
  if (os !== undefined) vi.mocked(osType).mockReturnValue(os as ReturnType<typeof osType>);
  vi.stubGlobal('navigator', Object.create(window.navigator, { userAgent: { value: userAgent } }));
  vi.resetModules();
  return import('./platform');
};

const wryLinuxUa =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const cefLinuxUa =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const chromeDesktopUa =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const firefoxLinuxUa = 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0';
const macWebviewUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const androidWebviewUa =
  'Mozilla/5.0 (Linux; Android 16; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0.7871.63 Mobile Safari/537.36';

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

describe('webviewStripsCustomProtocolCache', () => {
  it.each([
    ['android', androidWebviewUa, true],
    ['linux', cefLinuxUa, true],
    ['linux', wryLinuxUa, false],
    ['ios', macWebviewUa, false],
    ['macos', macWebviewUa, false],
    ['windows', cefLinuxUa, false],
  ])('is %s (%#) -> %s', async (os, userAgent, expected) => {
    const { webviewStripsCustomProtocolCache } = await loadPlatform(os, userAgent);
    expect(webviewStripsCustomProtocolCache()).toBe(expected);
  });

  it('is false outside Tauri, where no custom protocol is involved', async () => {
    const { webviewStripsCustomProtocolCache } = await loadPlatform(undefined, cefLinuxUa);
    expect(webviewStripsCustomProtocolCache()).toBe(false);
  });
});

describe('isWebKitGtk', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true for the Tauri wry webview on Linux', async () => {
    const { isWebKitGtk } = await loadPlatform('linux', wryLinuxUa);
    expect(isWebKitGtk()).toBe(true);
  });

  it('is false for the CEF runtime on Linux, which is Chromium', async () => {
    const { isWebKitGtk } = await loadPlatform('linux', cefLinuxUa);
    expect(isWebKitGtk()).toBe(false);
  });

  it.each([
    ['macOS Tauri (WKWebView)', 'macos', macWebviewUa],
    ['Windows Tauri (WebView2)', 'windows', chromeDesktopUa],
    ['Android Tauri (Chromium WebView)', 'android', androidWebviewUa],
  ])('is false on %s', async (_label, os, userAgent) => {
    const { isWebKitGtk } = await loadPlatform(os, userAgent);
    expect(isWebKitGtk()).toBe(false);
  });

  it.each([
    ['Chrome on Linux', chromeDesktopUa],
    ['Firefox on Linux', firefoxLinuxUa],
    ['Safari-engine browser on Linux', wryLinuxUa],
  ])('is false outside Tauri: %s', async (_label, userAgent) => {
    const { isWebKitGtk } = await loadPlatform(undefined, userAgent);
    expect(isWebKitGtk()).toBe(false);
  });
});
