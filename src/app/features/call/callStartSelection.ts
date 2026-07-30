export type CallStartOwner = 'livekit-mobile' | 'livekit-js' | 'element';

export const selectCallStartOwner = ({
  livekitJsProbeEnabled,
  nativeCallAvailable = false,
}: {
  livekitJsProbeEnabled: boolean;
  nativeCallAvailable?: boolean;
}): CallStartOwner => {
  if (nativeCallAvailable) return 'livekit-mobile';
  return livekitJsProbeEnabled ? 'livekit-js' : 'element';
};
