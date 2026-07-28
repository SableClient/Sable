import { getDesktopTauriPlatform } from '$utils/platform';

// Enable the desktop transport probe with VITE_ENABLE_NATIVE_CALL_PROBE=true or manually:
// localStorage.setItem('sable.nativeCallProbe', '1').
export const NATIVE_CALL_PROBE_STORAGE_KEY = 'sable.nativeCallProbe';

export const isNativeCallProbePlatformSupported = (): boolean => {
  const platform = getDesktopTauriPlatform();
  return platform === 'linux' || platform === 'macos';
};

export const isNativeCallProbeEnabled = (nativeCallsEnabled = false): boolean => {
  if (typeof window === 'undefined' || !isNativeCallProbePlatformSupported()) return false;

  if (import.meta.env.VITE_ENABLE_NATIVE_CALL_PROBE === 'true') return true;

  try {
    return nativeCallsEnabled || window.localStorage.getItem(NATIVE_CALL_PROBE_STORAGE_KEY) === '1';
  } catch {
    return nativeCallsEnabled;
  }
};
