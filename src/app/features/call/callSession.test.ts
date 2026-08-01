import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatrixClient, MatrixRTCSession, Room } from '$types/matrix-sdk';
import type {
  joinAndProvisionMatrixRTC as joinAndProvision,
  leaveMatrixRTCOnPageHide as leaveOnPageHide,
} from './matrixRtcCallLifecycle';
import {
  callEncryptsMedia,
  createCallSessionHandles,
  joinCallSession,
  type CallSessionJoinOptions,
} from './callSession';

const removePageHide = vi.fn<() => void>();

vi.mock('./matrixRtcCallLifecycle', () => ({
  joinAndProvisionMatrixRTC: vi.fn<typeof joinAndProvision>(async () => ({
    ownMembership: undefined,
    provisioned: { url: 'wss://livekit.example', jwt: 'jwt' },
  })),
  leaveMatrixRTCOnPageHide: vi.fn<typeof leaveOnPageHide>(() => removePageHide),
}));

const { joinAndProvisionMatrixRTC } = await import('./matrixRtcCallLifecycle');
const joinMock = vi.mocked(joinAndProvisionMatrixRTC);

const mx = {} as MatrixClient;
const session = {} as MatrixRTCSession;

const makeOptions = (overrides: Partial<CallSessionJoinOptions> = {}): CallSessionJoinOptions => ({
  mx,
  room: { roomId: '!room:example.org' } as Room,
  session,
  callIntent: 'audio',
  dm: false,
  ongoing: false,
  encryptMedia: true,
  isCancelled: () => false,
  onStage: () => {},
  ...overrides,
});

describe('callEncryptsMedia', () => {
  it('reads the room encryption state and nothing else', () => {
    const encrypted = { hasEncryptionStateEvent: () => true } as Room;
    const unencrypted = { hasEncryptionStateEvent: () => false } as Room;

    expect(callEncryptsMedia(encrypted)).toBe(true);
    expect(callEncryptsMedia(unencrypted)).toBe(false);
  });
});

describe('joinCallSession', () => {
  beforeEach(() => {
    joinMock.mockClear();
    removePageHide.mockClear();
  });

  // MSC4143 requires MatrixRTC encryption in encrypted rooms and forbids it in
  // unencrypted ones, so this flag may only ever mirror the room.
  it('manages media keys exactly when the room encrypts media', async () => {
    await joinCallSession(makeOptions({ encryptMedia: true }), createCallSessionHandles());
    expect(joinMock.mock.calls[0]?.[0]).toMatchObject({ manageMediaKeys: true });

    await joinCallSession(makeOptions({ encryptMedia: false }), createCallSessionHandles());
    expect(joinMock.mock.calls[1]?.[0]).toMatchObject({ manageMediaKeys: false });
  });

  it('rings a DM, notifies a room, and stays silent for an ongoing call', async () => {
    await joinCallSession(makeOptions({ dm: true }), createCallSessionHandles());
    expect(joinMock.mock.calls[0]?.[0].notificationType).toBe('ring');

    await joinCallSession(makeOptions({ dm: false }), createCallSessionHandles());
    expect(joinMock.mock.calls[1]?.[0].notificationType).toBe('notification');

    await joinCallSession(makeOptions({ dm: true, ongoing: true }), createCallSessionHandles());
    expect(joinMock.mock.calls[2]?.[0]).not.toHaveProperty('notificationType');
  });

  it('records what the join installed so a teardown can undo it', async () => {
    const handles = createCallSessionHandles();
    const cancel = vi.fn<() => void>();
    const unsubscribe = vi.fn<() => void>();
    joinMock.mockImplementationOnce(async (options) => {
      options.onMembershipWait?.(cancel);
      options.onCallRoomSubscribed?.(unsubscribe);
      options.onJoinStarted?.();
      return { ownMembership: undefined, provisioned: { url: 'wss://x', jwt: 'jwt' } };
    });

    expect(handles.joinStarted).toBe(false);
    await joinCallSession(makeOptions(), handles);

    expect(handles.joinStarted).toBe(true);
    expect(handles.cancelMembershipWait).toBe(cancel);
    expect(handles.unsubscribeCallRoom).toBe(unsubscribe);
    expect(handles.removePageHideListener).toBe(removePageHide);
  });
});
