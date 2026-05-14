import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Room } from '$types/matrix-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingCallInternal } from './IncomingCallModal';

const { navigateRoomMock, sendRtcDeclineMock } = vi.hoisted(() => ({
  navigateRoomMock: vi.fn<(roomId: string) => void>(),
  sendRtcDeclineMock: vi.fn<(roomId: string, eventId: string) => Promise<void>>(),
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    sendRtcDecline: sendRtcDeclineMock,
  }),
}));

vi.mock('$hooks/useRoomMeta', () => ({
  useRoomName: () => 'Direct Message',
}));

vi.mock('$utils/room', () => ({
  getRoomAvatarUrl: () => null,
}));

vi.mock('$hooks/useRoomNavigate', () => ({
  useRoomNavigate: () => ({
    navigateRoom: navigateRoomMock,
  }),
}));

vi.mock('./room-avatar', () => ({
  RoomAvatar: ({ alt }: { alt: string }) => <div>{alt}</div>,
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
  const room = { roomId: '!room:example.org' } as Room;
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
  });

  it('closes the modal when decline is pressed', async () => {
    const onClose = vi.fn<() => void>();
    render(<IncomingCallInternal room={room} incomingCall={incomingCall} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /decline/i }));

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
});
