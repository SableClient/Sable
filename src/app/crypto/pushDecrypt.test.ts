import { beforeEach, describe, expect, it, vi } from 'vitest';

type DecryptPushParams = {
  userId: string;
  deviceId: string;
  roomId: string;
  eventJson: string;
  passphrase: string | null;
};

const engineDecryptPush = vi.fn<(params: DecryptPushParams) => Promise<unknown>>();
const isTauri = vi.fn<() => boolean>(() => true);

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauri() }));
vi.mock('$generated/tauri/commands', () => ({
  engineDecryptPush: (params: DecryptPushParams) => engineDecryptPush(params),
}));

const { decryptPushEventNatively } = await import('./pushDecrypt');

const event = {
  roomId: '!room:example.org',
  eventId: '$event:example.org',
  sender: '@sender:example.org',
  content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'AAAA' },
};

describe('decryptPushEventNatively', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauri.mockReturnValue(true);
  });

  it('returns the plaintext content and type from the Rust engine', async () => {
    engineDecryptPush.mockResolvedValue({
      event_type: 'm.room.message',
      sender: '@real:example.org',
      body: 'hello',
      clear_event: JSON.stringify({
        type: 'm.room.message',
        sender: '@real:example.org',
        content: { msgtype: 'm.text', body: 'hello' },
      }),
    });

    await expect(decryptPushEventNatively('@me:example.org', 'DEVICE', event)).resolves.toEqual({
      eventType: 'm.room.message',
      content: { msgtype: 'm.text', body: 'hello' },
      sender: '@real:example.org',
    });
  });

  it('passes the payload as a reconstructed m.room.encrypted event', async () => {
    engineDecryptPush.mockResolvedValue({
      event_type: 'm.room.message',
      clear_event: JSON.stringify({ content: { body: 'hi' } }),
    });

    await decryptPushEventNatively('@me:example.org', 'DEVICE', event);

    const params = engineDecryptPush.mock.calls[0]?.[0];
    if (!params) throw new Error('the engine command was never called');
    expect(params).toMatchObject({
      userId: '@me:example.org',
      deviceId: 'DEVICE',
      roomId: '!room:example.org',
    });
    expect(JSON.parse(params.eventJson)).toMatchObject({
      type: 'm.room.encrypted',
      room_id: '!room:example.org',
      event_id: '$event:example.org',
      sender: '@sender:example.org',
      content: event.content,
    });
  });

  // Each of these is a case the js-sdk fallback must still get a chance to retry.
  it('returns null when the Megolm key has not arrived, so the caller can fall back', async () => {
    engineDecryptPush.mockRejectedValue(
      new Error('decrypting push event failed: UnknownMessageIndex')
    );

    await expect(decryptPushEventNatively('@me:example.org', 'DEVICE', event)).resolves.toBeNull();
  });

  it('returns null rather than throwing when isTauri itself throws', async () => {
    isTauri.mockImplementation(() => {
      throw new Error('not in a tauri context');
    });

    await expect(decryptPushEventNatively('@me:example.org', 'DEVICE', event)).resolves.toBeNull();
    expect(engineDecryptPush).not.toHaveBeenCalled();
  });

  it('returns null off Tauri without calling the engine', async () => {
    isTauri.mockReturnValue(false);

    await expect(decryptPushEventNatively('@me:example.org', 'DEVICE', event)).resolves.toBeNull();
    expect(engineDecryptPush).not.toHaveBeenCalled();
  });

  it('returns null without a session identity', async () => {
    await expect(decryptPushEventNatively(null, 'DEVICE', event)).resolves.toBeNull();
    await expect(decryptPushEventNatively('@me:example.org', null, event)).resolves.toBeNull();
    expect(engineDecryptPush).not.toHaveBeenCalled();
  });

  it('returns null when the clear event carries no content', async () => {
    engineDecryptPush.mockResolvedValue({
      event_type: 'm.room.message',
      clear_event: JSON.stringify({ type: 'm.room.message' }),
    });

    await expect(decryptPushEventNatively('@me:example.org', 'DEVICE', event)).resolves.toBeNull();
  });
});
