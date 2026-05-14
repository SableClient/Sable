import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Room } from '$types/matrix-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingCallInternal } from './IncomingCallModal';

const { navigateRoomMock, sendRtcDeclineMock, webRtcSupportedMock, livekitSupportedMock } = vi.hoisted(() => ({
  navigateRoomMock: vi.fn<(roomId: string) => void>(),
  sendRtcDeclineMock: vi.fn<(roomId: string, eventId: string) => Promise<void>>(),
  webRtcSupportedMock: vi.fn<() => boolean>(),
  livekitSupportedMock: vi.fn<() => boolean>(),
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    sendRtcDecline: sendRtcDeclineMock,
    getSafeUserId: () => '@me:example.org',
    mxcUrlToHttp: () => undefined,
  }),
}));

vi.mock('$hooks/useLivekitSupport', () => ({
  useLivekitSupport: () => livekitSupportedMock(),
}));

vi.mock('$hooks/useCallEmbed', () => ({
  useCallEmbed: () => undefined,
}));

vi.mock('$hooks/useScreenSize', () => ({
  ScreenSize: { Desktop: 'Desktop', Tablet: 'Tablet', Mobile: 'Mobile' },
  useScreenSizeContext: () => 'Desktop',
}));

vi.mock('$hooks/useRoomMeta', () => ({
  useRoomName: () => 'Direct Message',
}));

vi.mock('$utils/room', () => ({
  getRoomAvatarUrl: () => null,
  getMemberDisplayName: () => 'Alice',
}));

vi.mock('$hooks/useRoomNavigate', () => ({
  useRoomNavigate: () => ({
    navigateRoom: navigateRoomMock,
  }),
}));

vi.mock('$utils/rtc', () => ({
  webRTCSupported: () => webRtcSupportedMock(),
}));

vi.mock('./room-avatar', () => ({
  RoomAvatar: ({ alt }: { alt: string }) => <div>{alt}</div>,
}));

vi.mock('./user-avatar', () => ({
  UserAvatar: ({ alt }: { alt?: string }) => <div>{alt}</div>,
}));

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
  metrics: {
    count: vi.fn(),
  },
}));

vi.mock('$utils/debugLogger', () => ({
  createDebugLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('IncomingCallInternal', () => {
  const room = {
    roomId: '!room:example.org',
    getMember: () => ({
      getMxcAvatarUrl: () => undefined,
      rawDisplayName: 'Alice',
    }),
    currentState: {
      maySendStateEvent: () => true,
    },
  } as unknown as Room;
  const incomingCall = {
    roomId: room.roomId,
    notificationEventId: '$notif',
    refEventId: '$ref',
    senderId: '@alice:example.org',
    senderTs: Date.now(),
    expiresAt: Date.now() + 60_000,
    notificationType: 'ring' as const,
    intentKind: 'audio' as const,
    isDirect: true,
  };

  beforeEach(() => {
    navigateRoomMock.mockReset();
    sendRtcDeclineMock.mockReset().mockResolvedValue(undefined);
    webRtcSupportedMock.mockReset().mockReturnValue(true);
    livekitSupportedMock.mockReset().mockReturnValue(true);
  });

  it('closes the modal when decline is pressed', async () => {
    const onClose = vi.fn<() => void>();
    render(<IncomingCallInternal room={room} incomingCall={incomingCall} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Decline call' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(navigateRoomMock).not.toHaveBeenCalled();
    expect(sendRtcDeclineMock).toHaveBeenCalledWith('!room:example.org', '$notif');
  });

  it('navigates and closes when answer is pressed', () => {
    const onClose = vi.fn<() => void>();
    render(<IncomingCallInternal room={room} incomingCall={incomingCall} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /answer/i }));

    expect(navigateRoomMock).toHaveBeenCalledWith('!room:example.org');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables answer when WebRTC is unavailable', () => {
    webRtcSupportedMock.mockReturnValue(false);
    const onClose = vi.fn<() => void>();
    render(<IncomingCallInternal room={room} incomingCall={incomingCall} onClose={onClose} />);

    expect(screen.getByRole('button', { name: /answer voice call/i })).toBeDisabled();
  });

  it('ignores room call notifications without sending RTC decline', async () => {
    const onClose = vi.fn<() => void>();
    render(
      <IncomingCallInternal
        room={room}
        incomingCall={{ ...incomingCall, isDirect: false, notificationType: 'notification' }}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ignore call notification' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(sendRtcDeclineMock).not.toHaveBeenCalled();
  });

  it('shows homeserver capability issues and blocks answer when LiveKit is unavailable', () => {
    livekitSupportedMock.mockReturnValue(false);
    const onClose = vi.fn<() => void>();
    render(<IncomingCallInternal room={room} incomingCall={incomingCall} onClose={onClose} />);

    expect(
      screen.getByText(/homeserver does not expose a livekit call focus/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /answer voice call/i })).toBeDisabled();
    expect(screen.getByText(/homeserver call focus is unavailable/i)).toBeInTheDocument();
  });
});
