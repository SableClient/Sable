import type { Room } from '$types/matrix-sdk';

const CALL_MEMBER_EVENT_TYPE = 'org.matrix.msc3401.call.member';

export type CallStartBlocker =
  | 'missing_webrtc'
  | 'missing_livekit'
  | 'missing_call_member_permission'
  | 'already_in_another_call';

export type CallStartCapabilities = {
  canStart: boolean;
  canRenderCallButton: boolean;
  blockers: CallStartBlocker[];
  webRTCSupported: boolean;
  livekitSupported: boolean;
  hasCallMemberPermission: boolean;
  inAnotherCall: boolean;
};

type EvaluateCallStartCapabilitiesInput = {
  room: Room;
  myUserId: string;
  activeCallRoomId?: string;
  livekitSupported: boolean;
  rtcSupported: boolean;
};

export const evaluateCallStartCapabilities = ({
  room,
  myUserId,
  activeCallRoomId,
  livekitSupported,
  rtcSupported,
}: EvaluateCallStartCapabilitiesInput): CallStartCapabilities => {
  const blockers: CallStartBlocker[] = [];
  const hasCallMemberPermission =
    room.currentState?.maySendStateEvent(CALL_MEMBER_EVENT_TYPE, myUserId) ?? false;
  const inAnotherCall = !!activeCallRoomId && activeCallRoomId !== room.roomId;

  if (!rtcSupported) blockers.push('missing_webrtc');
  if (!livekitSupported) blockers.push('missing_livekit');
  if (!hasCallMemberPermission) blockers.push('missing_call_member_permission');
  if (inAnotherCall) blockers.push('already_in_another_call');

  const canRenderCallButton = !blockers.some((blocker) =>
    [
      'missing_webrtc',
      'missing_livekit',
      'missing_call_member_permission',
    ].includes(blocker)
  );

  return {
    canStart: blockers.length === 0,
    canRenderCallButton,
    blockers,
    webRTCSupported: rtcSupported,
    livekitSupported,
    hasCallMemberPermission,
    inAnotherCall,
  };
};
