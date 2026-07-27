import { isDesktopTauri } from '$utils/platform';

// Enable the desktop transport probe with VITE_ENABLE_NATIVE_CALL_PROBE=true or manually:
// localStorage.setItem('sable.nativeCallProbe', '1').
export const NATIVE_CALL_PROBE_STORAGE_KEY = 'sable.nativeCallProbe';

export const isNativeCallProbeEnabled = (): boolean => {
  if (typeof window === 'undefined' || !isDesktopTauri()) return false;

  if (import.meta.env.VITE_ENABLE_NATIVE_CALL_PROBE === 'true') return true;

  try {
    return window.localStorage.getItem(NATIVE_CALL_PROBE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};
