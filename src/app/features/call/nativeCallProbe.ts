import { isMobileTauri } from '$utils/platform';
import { getNativeCallCapabilities, type NativeCallCapabilities } from './livekitMobileBridge';

export const supportsNativeCall = (capabilities: NativeCallCapabilities): boolean =>
  capabilities.supported && capabilities.microphone;

let availabilityPromise: Promise<boolean> | undefined;

// Native calls are gated solely by the new-call setting; platform and
// capability checks still apply on top of it.
export const getNativeCallAvailability = (newCallsEnabled: boolean): Promise<boolean> => {
  if (!newCallsEnabled || !isMobileTauri()) return Promise.resolve(false);
  availabilityPromise ??= getNativeCallCapabilities().then(supportsNativeCall, () => false);
  return availabilityPromise;
};

export const resetNativeCallAvailabilityForTests = (): void => {
  availabilityPromise = undefined;
};
