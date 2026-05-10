import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserRoomProfileRenderer } from './UserRoomProfileRenderer';

const mocks = vi.hoisted(() => ({
  state: {
    roomId: '!room:example.org',
    userId: '@alice:example.org',
    cords: new DOMRect(0, 0, 1, 1),
  },
  room: {
    roomId: '!room:example.org',
  },
}));

vi.mock('folds', () => ({
  Menu: forwardRef<HTMLDivElement, { children: ReactNode } & HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    )
  ),
  PopOut: vi.fn<({ content }: { content: ReactNode }) => ReactNode>(({ content }) => (
    <div>{content}</div>
  )),
  toRem: vi.fn<(value: number) => string>((value) => `${value / 16}rem`),
}));

vi.mock('$state/hooks/userRoomProfile', () => ({
  useCloseUserRoomProfile: () => vi.fn<() => void>(),
  useUserRoomProfileState: () => mocks.state,
}));

vi.mock('$hooks/useGetRoom', () => ({
  useAllJoinedRoomsSet: () => new Set([mocks.room.roomId]),
  useGetRoom: () => (roomId: string) => (roomId === mocks.room.roomId ? mocks.room : undefined),
}));

vi.mock('$hooks/useSpace', () => ({
  SpaceProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('$hooks/useRoom', () => ({
  RoomProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./user-profile', () => ({
  UserRoomProfile: () => <button type="button">Profile actions</button>,
}));

describe('UserRoomProfileRenderer', () => {
  it('does not throw while lazy profile content is loading inside the focus trap', () => {
    expect(() => render(<UserRoomProfileRenderer />)).not.toThrow();
  });
});
