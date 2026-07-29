export type CallStartOwner = 'livekit-js' | 'element';

export const selectCallStartOwner = ({
  livekitJsProbeEnabled,
}: {
  livekitJsProbeEnabled: boolean;
}): CallStartOwner => (livekitJsProbeEnabled ? 'livekit-js' : 'element');
