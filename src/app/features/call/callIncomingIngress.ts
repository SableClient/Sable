import type { IncomingCall } from '$state/callEmbed';

export const isIncomingCallSuppressed = (
  incoming: IncomingCall,
  mutedRoomId: string | null,
  incomingVoiceRoomCallSoundEnabled: boolean
): boolean => {
  if (mutedRoomId === incoming.roomId) return true;
  if (!incoming.isDirect && !incomingVoiceRoomCallSoundEnabled) return true;
  return false;
};
