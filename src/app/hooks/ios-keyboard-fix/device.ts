// Vendored from https://github.com/Crscristi28/ios-pwa-keyboard-fix (MIT)
// Replace this import path with 'ios-pwa-keyboard-fix' once published to npm.

export const isStandalonePWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  // iOS Safari uses navigator.standalone (legacy, non-standard).
  // Other browsers use the W3C display-mode media query.
  const iosStandalone =
    'standalone' in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayModeStandalone;
};

export const isTablet = (): boolean => typeof window !== 'undefined' && window.innerWidth >= 768;

export const needsVirtualKeyboard = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const hasTouchScreen = navigator.maxTouchPoints > 0;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return hasTouchScreen && isCoarsePointer;
};
