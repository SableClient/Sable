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

const isMac = result.os.name === 'Mac OS';

export const ua = () => result;
export const isMacOS = () => isMac;
export const mobileOrTablet = () => isMobileOrTablet;

export const deviceDisplayName = (): string => {
  const browser = result.browser.name;
  const os = normalizeMacName(result.os.name);
  if (!browser || !os) return 'Sable Web';
  return `Sable on ${browser} for ${os}`;
};
