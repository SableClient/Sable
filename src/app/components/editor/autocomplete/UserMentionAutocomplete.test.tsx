import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, Room, RoomMember } from '$types/matrix-sdk';
import type {
  EditorAutocompleteQuery,
  ProseMirrorEditorController,
} from '../prosemirrorController';

const mocks = vi.hoisted(() => ({
  mx: {
    getUserId: vi.fn<() => string | null>().mockReturnValue('@me:example.org'),
    searchUserDirectory: vi.fn<MatrixClient['searchUserDirectory']>(),
  },
  resetSearch: vi.fn<() => void>(),
  search: vi.fn<(query: string) => void>(),
  roomMembers: [] as RoomMember[],
  searchResult: undefined as { query: string; items: RoomMember[] } | undefined,
}));

vi.mock('$hooks/useMatrixClient', () => ({ useMatrixClient: () => mocks.mx }));
vi.mock('$hooks/useMediaAuthentication', () => ({ useMediaAuthentication: () => false }));
vi.mock('$hooks/useRoomMembers', () => ({ useRoomMembers: () => mocks.roomMembers }));
vi.mock('$hooks/useAsyncSearch', () => ({
  useAsyncSearch: () => [mocks.searchResult, mocks.search, mocks.resetSearch],
}));
vi.mock('$hooks/useKeyDown', () => ({ useKeyDown: () => undefined }));

import { UserMentionAutocomplete } from './UserMentionAutocomplete';

const room = {
  roomId: '!room:example.org',
  getCanonicalAlias: () => undefined,
  getMember: () => undefined,
  membersLoaded: () => false,
} as unknown as Room;
const query: EditorAutocompleteQuery<string> = {
  from: 1,
  prefix: '@',
  text: 'alice',
  to: 6,
};

describe('UserMentionAutocomplete', () => {
  beforeEach(() => {
    mocks.roomMembers = [];
    mocks.searchResult = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('offers unloaded users from the global directory', async () => {
    vi.useFakeTimers();
    mocks.mx.searchUserDirectory.mockResolvedValue({
      limited: false,
      results: [{ user_id: '@alice:example.org', display_name: 'Alice' }],
    });
    const controller = {
      insertInline: vi.fn<(node: unknown, from: number, to: number) => void>(),
      insertText: vi.fn<(text: string) => void>(),
    } as unknown as ProseMirrorEditorController;
    const requestClose = vi.fn<() => void>();

    render(
      <UserMentionAutocomplete
        room={room}
        controller={controller}
        query={query}
        requestClose={requestClose}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mocks.mx.searchUserDirectory).toHaveBeenCalledWith({ term: 'alice', limit: 20 });
    fireEvent.click(screen.getByText('Alice'));
    expect(controller.insertInline).toHaveBeenCalledOnce();
    expect(controller.insertText).toHaveBeenCalledWith(' ');
    expect(requestClose).toHaveBeenCalledOnce();
  });

  it('keeps the previous matches while the search for a new query is pending', () => {
    mocks.roomMembers = [
      { userId: '@alice:example.org', membership: 'join', getMxcAvatarUrl: () => undefined },
      { userId: '@bob:example.org', membership: 'join', getMxcAvatarUrl: () => undefined },
    ] as unknown as RoomMember[];
    mocks.searchResult = {
      query: 'alic',
      items: [mocks.roomMembers[0]!],
    };

    render(
      <UserMentionAutocomplete
        room={room}
        controller={{} as unknown as ProseMirrorEditorController}
        query={query}
        requestClose={vi.fn<() => void>()}
      />
    );

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });
});
