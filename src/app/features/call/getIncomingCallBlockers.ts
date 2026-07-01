export type IncomingCallBlocker = {
  id: string;
  message: string;
  shortReason: string;
};

export type IncomingCallBlockerInput = {
  canUseWebRTC: boolean;
  livekitSupported: boolean;
  hasCallMemberPermission: boolean;
  inAnotherCall: boolean;
};

export const getIncomingCallBlockers = ({
  canUseWebRTC,
  livekitSupported,
  hasCallMemberPermission,
  inAnotherCall,
}: IncomingCallBlockerInput): IncomingCallBlocker[] => {
  const issues: IncomingCallBlocker[] = [];

  if (!canUseWebRTC) {
    issues.push({
      id: 'webrtc',
      message: 'Your browser does not support WebRTC calling.',
      shortReason: 'WebRTC is unavailable in this browser.',
    });
  }
  if (!livekitSupported) {
    issues.push({
      id: 'livekit',
      message: 'Your homeserver does not expose a LiveKit call focus.',
      shortReason: 'Homeserver call focus is unavailable.',
    });
  }
  if (!hasCallMemberPermission) {
    issues.push({
      id: 'permission',
      message: "You don't have permission to join this room's call.",
      shortReason: 'Missing permission to join this call.',
    });
  }
  if (inAnotherCall) {
    issues.push({
      id: 'another_call',
      message: 'You are already in another call.',
      shortReason: 'Finish your current call first.',
    });
  }

  return issues;
};
