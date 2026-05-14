import { fireEvent, render, screen } from '@testing-library/react';
import type { Room } from '$types/matrix-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingCallInternal } from './IncomingCallModal';

const { navigateRoomMock } = vi.hoisted(() => ({
  navigateRoomMock: vi.fn<(roomId: string) => void>(),
}));

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({}),
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

describe('IncomingCallInternal', () => {
  const room = { roomId: '!room:example.org' } as Room;

  beforeEach(() => {
    navigateRoomMock.mockReset();
  });

  it('closes the modal when decline is pressed', () => {
    const onClose = vi.fn<() => void>();
    render(<IncomingCallInternal room={room} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /decline/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigateRoomMock).not.toHaveBeenCalled();
  });

  it('navigates and closes when answer is pressed', () => {
    const onClose = vi.fn<() => void>();
    render(<IncomingCallInternal room={room} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /answer/i }));

    expect(navigateRoomMock).toHaveBeenCalledWith('!room:example.org');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
