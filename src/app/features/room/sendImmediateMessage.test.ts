import { describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import type { MatrixClient, RoomMessageEventContent } from '$types/matrix-sdk';
import { sendImmediateMessage } from './sendImmediateMessage';

vi.mock('@sentry/react', () => ({
  startSpan: vi.fn<
    (
      options: unknown,
      callback: () => Promise<{ event_id: string }>
    ) => Promise<{ event_id: string }>
  >((_options, callback) => callback()),
}));

describe('sendImmediateMessage', () => {
  it('sends through the active room and thread target', async () => {
    const sendMessage = vi.fn<MatrixClient['sendMessage']>().mockResolvedValue({ event_id: '$1' });
    const mx = { sendMessage } as unknown as MatrixClient;
    const content = { body: 'Hello', msgtype: 'm.text' } as RoomMessageEventContent;

    await expect(
      sendImmediateMessage({
        content,
        isEncrypted: false,
        mx,
        roomId: '!room:example.com',
        threadRootId: '$thread',
        txnId: 'txn-1',
      })
    ).resolves.toEqual({ event_id: '$1' });

    expect(Sentry.startSpan).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith('!room:example.com', '$thread', content, 'txn-1');
  });

  it('uses the main timeline send target when no thread root is active', async () => {
    const sendMessage = vi.fn<MatrixClient['sendMessage']>().mockResolvedValue({ event_id: '$2' });
    const mx = { sendMessage } as unknown as MatrixClient;
    const content = { body: 'Hello', msgtype: 'm.text' } as RoomMessageEventContent;

    await sendImmediateMessage({
      content,
      isEncrypted: true,
      mx,
      roomId: '!room:example.com',
    });

    expect(sendMessage).toHaveBeenCalledWith('!room:example.com', null, content, undefined);
  });
});
