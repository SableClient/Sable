import { isDesktopTauri } from '$utils/platform';

export const isLivekitJsCallProbeEnabled = (enabled = false): boolean =>
  enabled && isDesktopTauri();
