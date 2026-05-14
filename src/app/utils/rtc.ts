export const webRTCSupported = (): boolean => {
  if (typeof window === 'undefined') return false;

  return (
    'RTCPeerConnection' in window ||
    'webkitRTCPeerConnection' in window ||
    'mozRTCPeerConnection' in window ||
    'RTCIceGatherer' in window
  );
};
