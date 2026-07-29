import { isDesktopTauri, isMobileTauri } from '$utils/platform';

export const isCallProbePlatformSupported = (): boolean => isDesktopTauri() || isMobileTauri();

export const isLivekitJsCallProbeEnabled = (enabled = false): boolean =>
  enabled && isCallProbePlatformSupported();
