export type CallStartOwner = 'livekit-mobile' | 'livekit-js' | 'element';

export const selectCallStartOwner = ({
  newCallsEnabled,
  nativeCallAvailable = false,
}: {
  newCallsEnabled: boolean;
  nativeCallAvailable?: boolean;
}): CallStartOwner => {
  if (!newCallsEnabled) return 'element';
  if (nativeCallAvailable) return 'livekit-mobile';
  return 'livekit-js';
};
