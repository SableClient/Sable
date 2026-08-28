import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Message } from './Message';

/* oxlint-disable typescript/no-explicit-any */

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () =>
    ({
      getUserId: () => '@me:example.com',
      mxcUrlToHttp: () => null,
    }) as any,
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$hooks/useUserProfile', () => ({
  useUserProfile: () => ({}),
}));

vi.mock('$hooks/useSableCosmetics', () => ({
  useSableCosmetics: () => ({ color: undefined, font: undefined }),
}));

vi.mock('$hooks/useRoomMemberHydration', () => ({
  useRoomMemberHydration: () => undefined,
}));

vi.mock('$hooks/useRenderableMediaUrl', () => ({
  useRenderableMediaUrl: () => undefined,
}));

vi.mock('$hooks/useMentionClickHandler', () => ({
  useMentionClickHandler: () => undefined,
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [false, vi.fn<() => void>()],
}));

const createRoom = () =>
  ({
    roomId: '!room:example.com',
    emit: () => {},
    getTimelineForEvent: () => undefined,
    getMember: () => undefined,
  }) as any;

const createMessageEvent = () =>
  ({
    getContent: () => ({ msgtype: 'm.text', body: 'hello world' }),
    getClearContent: () => ({ msgtype: 'm.text', body: 'hello world' }),
    getId: () => '$evt:example.com',
    getTs: () => 1700000000000,
    getSender: () => '@alice:example.com',
    getType: () => 'm.room.message',
    sender: null,
    on: () => {},
    off: () => {},
  }) as any;

describe('Message forwarded ref', () => {
  it('exposes the inner message HTMLDivElement on mount and clears on unmount', () => {
    const ref = createRef<HTMLDivElement>();

    const { container, unmount } = render(
      <Message
        ref={ref}
        room={createRoom()}
        mEvent={createMessageEvent()}
        collapse={false}
        highlight={false}
        messageSpacing="400"
        onUserClick={() => {}}
        onUsernameClick={() => {}}
        onReplyClick={() => {}}
        onReactionToggle={() => {}}
        hour24Clock
        dateFormatString="dd MMM yyyy"
        senderId="@alice:example.com"
        senderDisplayName="Alice"
      >
        hello world
      </Message>
    );

    const messageDiv = container.querySelector('[tabindex="0"]');
    expect(messageDiv).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toBe(messageDiv);
    expect(ref.current).toHaveTextContent('hello world');

    unmount();

    expect(ref.current).toBeNull();
  });
});
