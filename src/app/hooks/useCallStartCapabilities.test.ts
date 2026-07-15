import { describe, expect, it } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import { evaluateCallStartCapabilities } from '$features/call/callStartCapabilities';

const createRoom = (roomId: string, canSend = true): Room =>
  ({
    roomId,
    currentState: {
      maySendStateEvent: () => canSend,
    },
  }) as unknown as Room;

describe('evaluateCallStartCapabilities', () => {
  it('allows call start when all capabilities are available', () => {
    const capabilities = evaluateCallStartCapabilities({
      room: createRoom('!room:example.org'),
      myUserId: '@me:example.org',
      activeCallRoomId: undefined,
      livekitSupported: true,
      rtcSupported: true,
    });

    expect(capabilities.canStart).toBe(true);
    expect(capabilities.canRenderCallButton).toBe(true);
    expect(capabilities.blockers).toHaveLength(0);
  });

  it('blocks and hides button when WebRTC is unsupported', () => {
    const capabilities = evaluateCallStartCapabilities({
      room: createRoom('!room:example.org'),
      myUserId: '@me:example.org',
      activeCallRoomId: undefined,
      livekitSupported: true,
      rtcSupported: false,
    });

    expect(capabilities.canStart).toBe(false);
    expect(capabilities.canRenderCallButton).toBe(false);
    expect(capabilities.blockers).toContain('missing_webrtc');
  });

  it('blocks and hides button when call-member permission is missing', () => {
    const capabilities = evaluateCallStartCapabilities({
      room: createRoom('!room:example.org', false),
      myUserId: '@me:example.org',
      activeCallRoomId: undefined,
      livekitSupported: true,
      rtcSupported: true,
    });

    expect(capabilities.canStart).toBe(false);
    expect(capabilities.canRenderCallButton).toBe(false);
    expect(capabilities.blockers).toContain('missing_call_member_permission');
  });

  it('blocks start but keeps button visible when already in another call', () => {
    const capabilities = evaluateCallStartCapabilities({
      room: createRoom('!room:example.org'),
      myUserId: '@me:example.org',
      activeCallRoomId: '!other:example.org',
      livekitSupported: true,
      rtcSupported: true,
    });

    expect(capabilities.canStart).toBe(false);
    expect(capabilities.canRenderCallButton).toBe(true);
    expect(capabilities.blockers).toEqual(['already_in_another_call']);
  });

  it('does not block when active call is in the same room', () => {
    const capabilities = evaluateCallStartCapabilities({
      room: createRoom('!room:example.org'),
      myUserId: '@me:example.org',
      activeCallRoomId: '!room:example.org',
      livekitSupported: true,
      rtcSupported: true,
    });

    expect(capabilities.canStart).toBe(true);
    expect(capabilities.inAnotherCall).toBe(false);
  });
});
