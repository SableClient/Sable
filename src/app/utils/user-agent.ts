import { UAParser } from 'ua-parser-js';

const result = new UAParser(window.navigator.userAgent).getResult();

const isMobileOrTablet = (() => {
  const { os, device } = result;
  if (device.type === 'mobile' || device.type === 'tablet') return true;
  if (os.name === 'Android' || os.name === 'iOS') return true;
  // iPad on iOS 13+ sends a macOS Safari user agent by default ("Request Desktop Website").
  // ua-parser-js therefore reports os.name === 'Mac OS' with no device.type.
  // Real Macs never have maxTouchPoints > 1 (Magic Trackpad reports 1 at most in browsers),
  // so this safely identifies iPads masquerading as desktop Safari.
  if (os.name === 'Mac OS' && navigator.maxTouchPoints > 1) return true;
  return false;
})();

const normalizeMacName = (os?: string) => {
  if (!os) return os;
  if (os === 'Mac OS') return 'macOS';
  return os;
};

// True only for phone-form-factor devices when a surface must behave like a
// phone regardless of user-agent quirks. Tablets (native iPadOS UA or
// "Request Desktop Website") intentionally return false so split-pane and
// desktop-style settings/navigation remain available there.
const isPhoneDevice = result.device.type === 'mobile';

const isMac = result.os.name === 'Mac OS';

export const ua = () => result;
export const isMacOS = () => isMac;
/**
 * Broad device helper: true for phones and tablets, including iPads using a
 * desktop Safari user agent. Use this for touch/mobile-runtime concerns such as
 * keyboard handling, gestures, scroll locking, or notification defaults.
 *
 * Do not use this to decide whether a view should collapse into the phone-only
 * single-pane layout; that would incorrectly send tablets into phone flows.
 */
export const mobileOrTablet = () => isMobileOrTablet;
/**
 * Phone-only layout helper. Use this for route/layout decisions that should
 * collapse to the full-screen mobile experience on phones while preserving the
 * desktop/tablet settings and split-pane layout on sufficiently large tablets.
 *
 * Tablets — whether using native iPadOS UA or iPad "Request Desktop Website" —
 * return false here on purpose. Use `mobileOrTablet` instead for broad
 * touch/mobile-runtime behaviour.
 */
export const isPhoneLayoutDevice = () => isPhoneDevice;
/** True only for phones; returns false for tablets (e.g. iPad with external keyboard). */
export const isPhone = () => isPhoneDevice;

export const deviceDisplayName = (): string => {
  const browser = result.browser.name;
  const os = normalizeMacName(result.os.name);
  if (!browser || !os) return 'Sable Web';
  return `Sable on ${browser} for ${os}`;
};
