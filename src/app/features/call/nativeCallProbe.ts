import { isMobileTauri } from '$utils/platform';
import { getNativeCallCapabilities, type NativeCallCapabilities } from './livekitMobileBridge';

// Enable the native transport probe with VITE_ENABLE_NATIVE_CALL_PROBE=true or manually:
// localStorage.setItem('sable.nativeCallProbe', '1').
export const NATIVE_CALL_PROBE_STORAGE_KEY = 'sable.nativeCallProbe';

export const isNativeCallProbeEnabled = (): boolean => {
  if (typeof window === 'undefined' || !isMobileTauri()) return false;

  if (import.meta.env.VITE_ENABLE_NATIVE_CALL_PROBE === 'true') return true;

  try {
    return window.localStorage.getItem(NATIVE_CALL_PROBE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const supportsNativeCall = (capabilities: NativeCallCapabilities): boolean =>
  capabilities.supported && capabilities.microphone;

let availabilityPromise: Promise<boolean> | undefined;

export const getNativeCallAvailability = (): Promise<boolean> => {
  if (!isNativeCallProbeEnabled()) return Promise.resolve(false);
  availabilityPromise ??= getNativeCallCapabilities().then(supportsNativeCall, () => false);
  return availabilityPromise;
};

export const resetNativeCallAvailabilityForTests = (): void => {
  availabilityPromise = undefined;
};
