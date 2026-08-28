import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { UAParser } from 'ua-parser-js';

export const ua = new UAParser(window.navigator.userAgent).getResult();

let tauriOSResolved = false;
let tauriOSValue: string | undefined;

function getTauriOS(): string | undefined {
  if (!tauriOSResolved) {
    tauriOSResolved = true;
    if (isTauri()) {
      try {
        tauriOSValue = osType();
      } catch {
        tauriOSValue = undefined;
      }
    }
  }
  return tauriOSValue;
}

const MOBILE_TAURI_OS = ['android', 'ios'] as const;
const DESKTOP_TAURI_OS = ['linux', 'macos', 'windows'] as const;

export function isMobileOrTablet(): boolean {
  const tauriOS = getTauriOS();
  if (tauriOS && (MOBILE_TAURI_OS as readonly string[]).includes(tauriOS)) return true;
  if (tauriOS && (DESKTOP_TAURI_OS as readonly string[]).includes(tauriOS)) return false;

  const { os, device } = ua;
  if (device.type === 'mobile' || device.type === 'tablet') return true;
  if (os.name === 'Android' || os.name === 'iOS') return true;
  return false;
}

export function isMacOS(): boolean {
  return ua.os.name === 'Mac OS' || ua.os.name === 'macOS';
}

export function iosApp(): boolean {
  return getTauriOS() === 'ios';
}

export function isNightly(): boolean {
  return SABLE_BUILD_FLAVOR === 'dev';
}

export function versionLabel(opts?: { includeNightly?: boolean }): string {
  const dev = (opts?.includeNightly ?? true) && isNightly() ? '-dev' : '';
  const hash = BUILD_HASH ? ` (${BUILD_HASH})` : '';
  return `v${APP_VERSION}${dev}${hash}`;
}

export function hasServiceWorker(): boolean {
  return 'serviceWorker' in navigator && !isTauri();
}

export type DesktopTauriPlatform = (typeof DESKTOP_TAURI_OS)[number];

export function getDesktopTauriPlatform(): DesktopTauriPlatform | undefined {
  const tauriOS = getTauriOS();
  return (DESKTOP_TAURI_OS as readonly string[]).includes(tauriOS ?? '')
    ? (tauriOS as DesktopTauriPlatform)
    : undefined;
}

export function isDesktopTauri(): boolean {
  return getDesktopTauriPlatform() !== undefined;
}

export function isDesktopUpdaterEnabled(): boolean {
  return DESKTOP_UPDATER_ENABLED;
}

export function isMobileTauri(): boolean {
  const tauriOS = getTauriOS();
  return tauriOS === 'ios' || tauriOS === 'android';
}

export function isAndroidTauri(): boolean {
  return getTauriOS() === 'android';
}

export function isWebKitGtk(): boolean {
  return getTauriOS() === 'linux' && !/Chrome\//.test(window.navigator.userAgent);
}

// wry forces no-store on Android custom-protocol responses (RustWebViewClient.kt) and CEF does
// the same; WKWebView, WebView2 and WebKitGTK pass it through.
export function webviewStripsCustomProtocolCache(): boolean {
  const tauriOS = getTauriOS();
  if (tauriOS === 'android') return true;
  return tauriOS === 'linux' && !isWebKitGtk();
}

export function hasControllingServiceWorker(): boolean {
  return hasServiceWorker() && navigator.serviceWorker.controller !== null;
}

export function getAppOrigin(): string {
  if (
    isTauri() ||
    (typeof window !== 'undefined' && window.location.hostname === 'tauri.localhost')
  ) {
    return 'https://app.sable.moe';
  }
  return window.location.origin === 'null'
    ? `${window.location.protocol}//${window.location.host}`
    : window.location.origin;
}

// Runtime origin of the current window. getAppOrigin() returns the canonical
// app URL on Tauri, which does not match the parent frame — use this for
// widget parentUrl / postMessage targetOrigin.
export function getWindowOrigin(): string {
  return window.location.origin === 'null'
    ? `${window.location.protocol}//${window.location.host}`
    : window.location.origin;
}

type FormFactor = 'Web' | 'Desktop' | 'Mobile';

// Display names for every known Tauri OS value. Kept exhaustive (rather than relying on capitalize() as a silent fallback) so a new OS is a visible gap.
const TAURI_OS_DISPLAY_NAMES: Record<string, string> = {
  linux: 'Linux',
  macos: 'macOS',
  windows: 'Windows',
  android: 'Android',
  ios: 'iOS',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeOSName(os: string): string {
  return os === 'Mac OS' ? 'macOS' : os;
}

function variantLabel(): string {
  return isNightly() ? ' (Nightly)' : '';
}

function formFactor(): FormFactor {
  if (!isTauri()) return 'Web';
  const tauriOS = getTauriOS();
  if (tauriOS && (MOBILE_TAURI_OS as readonly string[]).includes(tauriOS)) return 'Mobile';
  return 'Desktop';
}

function osSpec(): string {
  if (!isTauri()) {
    const browser = ua.browser.name;
    const os = ua.os.name;
    if (browser && os) return `${browser} for ${normalizeOSName(os)}`;
    if (browser) return browser;
    if (os) return normalizeOSName(os);
    return 'Web';
  }
  const tauriOS = getTauriOS();
  if (tauriOS) return TAURI_OS_DISPLAY_NAMES[tauriOS] ?? capitalize(tauriOS);
  const os = ua.os.name;
  return os ? normalizeOSName(os) : 'Desktop';
}

export function deviceDisplayName(): string {
  return `${SABLE_PRODUCT_NAME} ${formFactor()}${variantLabel()} on ${osSpec()}`;
}
