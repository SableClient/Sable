import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { UAParser } from 'ua-parser-js';

const result = new UAParser(window.navigator.userAgent).getResult();

const isMobileOrTablet = (() => {
  if (isTauri()) {
    try {
      const tauriOs = osType();
      if (tauriOs === 'android' || tauriOs === 'ios') return true;
    } catch {
      // Fallback to UA parsing if plugin-os is not ready/available
    }
  }
  const { os, device } = result;
  if (device.type === 'mobile' || device.type === 'tablet') return true;
  if (os.name === 'Android' || os.name === 'iOS') return true;
  return false;
})();

const normalizeMacName = (os?: string) => {
  if (!os) return os;
  if (os === 'Mac OS') return 'macOS';
  return os;
};

const isMac = result.os.name === 'Mac OS' || result.os.name === 'macOS';

export const isMacOS = () => isMac;
export const mobileOrTablet = () => isMobileOrTablet;

export const deviceDisplayName = (): string => {
  const browser = result.browser.name;
  const os = normalizeMacName(result.os.name);
  if (!browser || !os) return 'Sable Web';
  return `Sable on ${browser} for ${os}`;
};
