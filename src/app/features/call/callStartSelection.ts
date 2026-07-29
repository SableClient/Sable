export type CallStartOwner = 'livekit-js' | 'native' | 'element';

export const selectCallStartOwner = ({
  livekitJsProbeEnabled,
  nativeProbeEnabled,
}: {
  livekitJsProbeEnabled: boolean;
  nativeProbeEnabled: boolean;
}): CallStartOwner => {
  if (livekitJsProbeEnabled) return 'livekit-js';
  if (nativeProbeEnabled) return 'native';
  return 'element';
};
