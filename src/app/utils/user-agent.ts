import { UAParser } from 'ua-parser-js';

const result = new UAParser(window.navigator.userAgent).getResult();

const isMobileOrTablet = (() => {
  const { os, device } = result;
  if (device.type === 'mobile' || device.type === 'tablet') return true;
  if (os.name === 'Android' || os.name === 'iOS') return true;
  return false;
})();

const isMac = result.os.name === 'Mac OS';

export const ua = () => result;
export const isMacOS = () => isMac;
export const mobileOrTablet = () => isMobileOrTablet;

export const deviceDisplayName = (): string => {
  const browser = result.browser.name;
  const os = result.os.name;
  if (!browser || !os) return 'Sable Web';
  return `Sable on ${browser} for ${os}`;
};
