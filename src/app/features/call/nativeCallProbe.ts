import { isMobileTauri } from '$utils/platform';
import {
  getNativeCallCapabilities as probeNativeCallCapabilities,
  type NativeCallCapabilities as PluginNativeCallCapabilities,
} from '@sableclient/tauri-plugin-livekit-mobile';

const supportsNativeCall = (capabilities: PluginNativeCallCapabilities): boolean =>
  capabilities.supported && capabilities.microphone;

let availabilityPromise: Promise<PluginNativeCallCapabilities | undefined> | undefined;

const isStableVerdict = (capabilities: PluginNativeCallCapabilities): boolean =>
  !capabilities.supported || capabilities.microphone;

export const getNativeCallCapabilities = (): Promise<PluginNativeCallCapabilities | undefined> => {
  if (!isMobileTauri()) return Promise.resolve(undefined);
  return (availabilityPromise ??= probeNativeCallCapabilities().then(
    (capabilities) => {
      if (!isStableVerdict(capabilities)) availabilityPromise = undefined;
      return capabilities;
    },
    () => {
      availabilityPromise = undefined;
      return undefined;
    }
  ));
};

export const getNativeCallAvailability = (): Promise<boolean> => {
  if (!isMobileTauri()) return Promise.resolve(false);
  return getNativeCallCapabilities().then((capabilities) =>
    capabilities ? supportsNativeCall(capabilities) : false
  );
};

export const resetNativeCallAvailabilityForTests = (): void => {
  availabilityPromise = undefined;
};
