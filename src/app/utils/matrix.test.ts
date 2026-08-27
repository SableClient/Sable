import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';

const tauriApi = vi.hoisted(() => ({
  isTauri: vi.fn<() => boolean>(),
  convertFileSrc: vi.fn<(url: string, protocol: string) => string>(
    (url: string, protocol: string) => `${protocol}://${url}`
  ),
}));

const mediaTransport = vi.hoisted(() => ({
  fetchMediaBlob: vi.fn<(url: string) => Promise<Blob>>(),
  getCurrentMediaSessionScope: vi.fn<() => string>(() => '@user:example.com'),
}));

const reactions = vi.hoisted(() => ({
  getEventReactions: vi.fn<() => unknown>(),
}));

vi.mock('@tauri-apps/api/core', () => tauriApi);
vi.mock('./mediaTransport', () => mediaTransport);
vi.mock('./room/relations', () => reactions);

const {
  getDMRoomFor,
  mxcUrlToHttp,
  rewriteAuthenticatedMediaUrl,
  toggleReaction,
  optimisticallyRedactEvent,
} = await import('./matrix');
const {
  getDMRoomFor,
  mxcUrlToHttp,
  rewriteAuthenticatedMediaUrl,
  toggleReaction,
  optimisticallyRedactEvent,
} = await import('./matrix');

describe('rewriteAuthenticatedMediaUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for null input', () => {
    tauriApi.isTauri.mockReturnValue(true);
    expect(rewriteAuthenticatedMediaUrl(null)).toBeNull();
  });

  it('passes through non-Tauri without rewriting', () => {
    tauriApi.isTauri.mockReturnValue(false);
    const url = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/abc';
    expect(rewriteAuthenticatedMediaUrl(url)).toBe(url);
    expect(tauriApi.convertFileSrc).not.toHaveBeenCalled();
  });

  it('passes through plain https URLs that are not authenticated media', () => {
    tauriApi.isTauri.mockReturnValue(true);
    const url = 'https://example.org/avatar.png';
    expect(rewriteAuthenticatedMediaUrl(url)).toBe(url);
    expect(tauriApi.convertFileSrc).not.toHaveBeenCalled();
  });

  it('rewrites authenticated-media download URLs under Tauri', () => {
    tauriApi.isTauri.mockReturnValue(true);
    const url = 'https://matrix.example.org/_matrix/client/v1/media/download/example.org/abc123';
    expect(rewriteAuthenticatedMediaUrl(url)).toBe(
      `sable-media://${url}?__sable_media_cache=3&__sable_media_session=%40user%3Aexample.com`
    );
    expect(tauriApi.convertFileSrc).toHaveBeenCalledWith(url, 'sable-media');
  });

  it('rewrites authenticated-media thumbnail URLs under Tauri', () => {
    tauriApi.isTauri.mockReturnValue(true);
    const url =
      'https://matrix.example.org/_matrix/client/v1/media/thumbnail/example.org/abc123?width=96&height=96&method=crop';
    expect(rewriteAuthenticatedMediaUrl(url)).toBe(
      `sable-media://${url}&__sable_media_cache=3&__sable_media_session=%40user%3Aexample.com`
    );
  });

  it.each([
    '/_matrix/media/v3/download/example.org/abc123',
    '/_matrix/media/v3/thumbnail/example.org/abc123?width=96&height=96&method=crop',
    '/_matrix/media/r0/download/example.org/abc123',
    '/_matrix/media/r0/thumbnail/example.org/abc123?width=96&height=96&method=crop',
  ])('rewrites legacy media paths under Tauri: %s', (path) => {
    tauriApi.isTauri.mockReturnValue(true);
    const url = `https://matrix.example.org${path}`;
    const separator = url.includes('?') ? '&' : '?';
    expect(rewriteAuthenticatedMediaUrl(url)).toBe(
      `sable-media://${url}${separator}__sable_media_cache=3&__sable_media_session=%40user%3Aexample.com`
    );
  });

  it('does not rewrite unrelated Matrix media URLs', () => {
    tauriApi.isTauri.mockReturnValue(true);
    const url = 'https://matrix.example.org/_matrix/media/v3/config';
    expect(rewriteAuthenticatedMediaUrl(url)).toBe(url);
    expect(tauriApi.convertFileSrc).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.org/avatar.png?next=/_matrix/media/v3/download/example.org/abc123',
    'https://example.org/avatar.png#/_matrix/media/r0/thumbnail/example.org/abc123',
  ])('does not rewrite a media path only present in query or hash: %s', (url) => {
    tauriApi.isTauri.mockReturnValue(true);
    expect(rewriteAuthenticatedMediaUrl(url)).toBe(url);
    expect(tauriApi.convertFileSrc).not.toHaveBeenCalled();
  });

  it('passes through already-rewritten sable-media:// URLs', () => {
    tauriApi.isTauri.mockReturnValue(true);
    const url =
      'sable-media://https://matrix.example.org/_matrix/client/v1/media/download/example.org/abc123';
    expect(rewriteAuthenticatedMediaUrl(url)).toBe(
      `${url}?__sable_media_cache=3&__sable_media_session=%40user%3Aexample.com`
    );
    expect(tauriApi.convertFileSrc).not.toHaveBeenCalled();
  });
});

describe('toggleReaction', () => {
  it('redacts the existing reaction from the current user', () => {
    const redaction = {};
    const redaction = {};
    const reaction = {
      getId: () => '$reaction',
      getSender: () => '@me:example.org',
      getRelation: () => ({ event_id: '$message' }),
      isRedacted: () => false,
      markLocallyRedacted: vi.fn<(event: unknown) => void>(),
      unmarkLocallyRedacted: vi.fn<() => void>(),
      getRelation: () => ({ event_id: '$message' }),
      isRedacted: () => false,
      markLocallyRedacted: vi.fn<(event: unknown) => void>(),
      unmarkLocallyRedacted: vi.fn<() => void>(),
    };
    reactions.getEventReactions.mockReturnValue({
      getSortedAnnotationsByKey: () => [['👍', new Set([reaction])]],
    });
    const mx = {
      getUserId: () => '@me:example.org',
      makeTxnId: () => 'txn',
      redactEvent: vi.fn<(...args: unknown[]) => Promise<object>>(() => Promise.resolve({})),
      makeTxnId: () => 'txn',
      redactEvent: vi.fn<(...args: unknown[]) => Promise<object>>(() => Promise.resolve({})),
      sendEvent: vi.fn<(...args: unknown[]) => void>(),
    } as unknown as MatrixClient;
    const room = {
      roomId: '!room:example.org',
      getUnfilteredTimelineSet: vi.fn<() => unknown>(),
      findEventById: () => redaction,
      findEventById: () => redaction,
    };

    toggleReaction(mx, room as never, '$message', '👍');

    expect(mx.redactEvent).toHaveBeenCalledWith('!room:example.org', '$reaction', 'txn', undefined);
    expect(reaction.markLocallyRedacted).toHaveBeenCalledWith(redaction);
    expect(mx.redactEvent).toHaveBeenCalledWith('!room:example.org', '$reaction', 'txn', undefined);
    expect(reaction.markLocallyRedacted).toHaveBeenCalledWith(redaction);
    expect(mx.sendEvent).not.toHaveBeenCalled();
  });

  it('rolls back an optimistic redaction when sending fails', async () => {
    const relation = {
      addEvent: vi.fn<(event: unknown) => Promise<void>>(() => Promise.resolve()),
    };
    reactions.getEventReactions.mockReturnValue(relation);
    const target = {
      getId: () => '$reaction',
      getRelation: () => ({ event_id: '$message' }),
      isRedacted: () => false,
      markLocallyRedacted: vi.fn<(event: unknown) => void>(),
      unmarkLocallyRedacted: vi.fn<() => void>(),
    };
    const error = new Error('failed');
    const mx = {
      makeTxnId: () => 'txn',
      redactEvent: () => Promise.reject(error),
    } as unknown as MatrixClient;
    const timelineSet = {};
    const room = {
      roomId: '!room:example.org',
      getUnfilteredTimelineSet: () => timelineSet,
      findEventById: () => ({}),
    };

    await expect(optimisticallyRedactEvent(mx, room as never, target as never)).rejects.toBe(error);

    expect(target.unmarkLocallyRedacted).toHaveBeenCalledOnce();
    expect(relation.addEvent).toHaveBeenCalledWith(target);
  });
});

describe('mxcUrlToHttp', () => {
  it('rewrites SDK legacy media URLs under Tauri without useAuthentication', () => {
    tauriApi.isTauri.mockReturnValue(true);
    const legacyUrl = 'https://matrix.example.org/_matrix/media/v3/download/example.org/video';
    const mx = {
      mxcUrlToHttp: vi.fn<() => string>(() => legacyUrl),
    } as unknown as MatrixClient;

    expect(mxcUrlToHttp(mx, 'mxc://example.org/video', false)).toBe(
      `sable-media://${legacyUrl}?__sable_media_cache=3&__sable_media_session=%40user%3Aexample.com`
    );
  });
});

type MockRoom = {
  roomId: string;
  memberships?: Record<string, string>;
  encrypted?: boolean;
  lastActive?: number;
};

const makeClient = (rooms: MockRoom[], mDirect?: Record<string, string[]>): MatrixClient => {
  const roomMap = new Map(
    rooms.map((mock) => [
      mock.roomId,
      {
        roomId: mock.roomId,
        getMyMembership: () => 'join',
        getMember: (userId: string) => {
          const membership = mock.memberships?.[userId];
          return membership ? { userId, membership } : null;
        },
        getMembers: () =>
          Object.entries(mock.memberships ?? {}).map(([userId, membership]) => ({
            userId,
            membership,
          })),
        hasEncryptionStateEvent: () => mock.encrypted ?? false,
        getLastActiveTimestamp: () => mock.lastActive ?? 0,
        getBumpStamp: () => undefined,
      },
    ])
  );

  return {
    getRooms: () => Array.from(roomMap.values()),
    getRoom: (roomId: string) => roomMap.get(roomId) ?? null,
    getAccountData: () => (mDirect ? { getContent: () => mDirect } : undefined),
  } as unknown as MatrixClient;
};

describe('getDMRoomFor', () => {
  const otherUserId = '@other:example.org';

  it('reuses a tagged room which is unencrypted and has a member who left', () => {
    const mx = makeClient(
      [
        {
          roomId: '!dm:example.org',
          memberships: { [otherUserId]: 'join', '@left:example.org': 'leave' },
        },
      ],
      { [otherUserId]: ['!dm:example.org'] }
    );

    expect(getDMRoomFor(mx, otherUserId)?.roomId).toBe('!dm:example.org');
  });

  it('prefers a tagged room the user is still part of', () => {
    const mx = makeClient(
      [
        {
          roomId: '!abandoned:example.org',
          lastActive: 20,
          memberships: { [otherUserId]: 'leave' },
        },
        { roomId: '!active:example.org', lastActive: 10, memberships: { [otherUserId]: 'join' } },
      ],
      { [otherUserId]: ['!abandoned:example.org', '!active:example.org'] }
    );

    expect(getDMRoomFor(mx, otherUserId)?.roomId).toBe('!active:example.org');
  });

  it('picks the most recently active tagged room', () => {
    const mx = makeClient(
      [
        { roomId: '!old:example.org', lastActive: 10, memberships: { [otherUserId]: 'join' } },
        { roomId: '!recent:example.org', lastActive: 30, memberships: { [otherUserId]: 'join' } },
      ],
      { [otherUserId]: ['!old:example.org', '!recent:example.org'] }
    );

    expect(getDMRoomFor(mx, otherUserId)?.roomId).toBe('!recent:example.org');
  });

  it('falls back to an encrypted one to one room when m.direct has no entry', () => {
    const mx = makeClient([
      { roomId: '!dm:example.org', encrypted: true, memberships: { [otherUserId]: 'join' } },
    ]);

    expect(getDMRoomFor(mx, otherUserId)?.roomId).toBe('!dm:example.org');
  });

  it('returns undefined when no room is shared with the user', () => {
    const mx = makeClient([{ roomId: '!other:example.org', encrypted: true, memberships: {} }], {
      '@someone:example.org': ['!other:example.org'],
    });

    expect(getDMRoomFor(mx, otherUserId)).toBeUndefined();
  });
});
