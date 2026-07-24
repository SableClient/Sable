import { describe, expect, it, vi } from 'vitest';
import {
  createUnifiedPushMessageListener,
  parseUnifiedPushMessage,
} from './UnifiedPushMessageListener';

describe('createUnifiedPushMessageListener', () => {
  it('catches rejected payload handlers instead of leaking unhandled rejections', async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const listener = createUnifiedPushMessageListener(async () => {
      throw new Error('boom');
    }, onError);

    expect(listener({})).toBeUndefined();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });
});

describe('parseUnifiedPushMessage', () => {
  it('unwraps the Matrix notification from the message JSON string', () => {
    const raw = {
      message: JSON.stringify({
        notification: { type: 'm.room.message', room_id: '!r:server', event_id: '$e' },
      }),
    };

    expect(parseUnifiedPushMessage(raw)).toEqual({
      type: 'm.room.message',
      room_id: '!r:server',
      event_id: '$e',
    });
  });

  it('returns the payload as-is when there is no notification wrapper', () => {
    const raw = { message: JSON.stringify({ event_id: '$e', room_id: '!r:server' }) };

    expect(parseUnifiedPushMessage(raw)).toEqual({ event_id: '$e', room_id: '!r:server' });
  });

  it('returns null for a missing or non-JSON message', () => {
    expect(parseUnifiedPushMessage({})).toBeNull();
    expect(parseUnifiedPushMessage({ message: 'not json' })).toBeNull();
  });
});
