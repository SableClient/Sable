import { UAParser } from 'ua-parser-js';

const result = new UAParser(window.navigator.userAgent).getResult();

const isMobileOrTablet = (() => {
  const { os, device } = result;
  if (device.type === 'mobile' || device.type === 'tablet') return true;
  if (os.name === 'Android' || os.name === 'iOS') return true;
  return false;
})();

// True only for phone-form-factor devices (not tablets).
// ua-parser-js sets device.type === 'mobile' for phones and 'tablet' for tablets,
// so this correctly returns false for iPads with external keyboards.
const isPhoneDevice = result.device.type === 'mobile';

const normalizeMacName = (os?: string) => {
  if (!os) return os;
  if (os === 'Mac OS') return 'macOS';
  return os;
};

const isMac = result.os.name === 'Mac OS';

export const ua = () => result;
export const isMacOS = () => isMac;
export const mobileOrTablet = () => isMobileOrTablet;
/** True only for phones; returns false for tablets (e.g. iPad with external keyboard). */
export const isPhone = () => isPhoneDevice;

export const deviceDisplayName = (): string => {
  const browser = result.browser.name;
  const os = normalizeMacName(result.os.name);
  if (!browser || !os) return 'Sable Web';
  return `Sable on ${browser} for ${os}`;
};
