import type { IncomingCall } from '$state/callEmbed';

export const isIncomingCallSuppressed = (
  incoming: IncomingCall,
  mutedRoomId: string | null
): boolean => mutedRoomId === incoming.roomId;
