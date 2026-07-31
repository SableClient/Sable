import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoNotImplementedError, RustIpcCrypto } from './RustIpcCrypto';
import type { EngineInfo, OutgoingCryptoRequest } from './engineClient';

const commands = vi.hoisted(() => ({
  engineClose: vi.fn<() => Promise<boolean>>(),
  engineDecryptEvent: vi.fn<() => Promise<Record<string, unknown>>>(),
  engineEncryptEvent: vi.fn<() => Promise<string>>(),
  engineMarkRequestSent: vi.fn<() => Promise<void>>(),
  engineOpen: vi.fn<() => Promise<EngineInfo>>(),
  engineOutgoingRequests: vi.fn<() => Promise<OutgoingCryptoRequest[]>>(),
  engineReceiveSyncChanges:
    vi.fn<(params: { request: Record<string, unknown> }) => Promise<Record<string, unknown>>>(),
  engineDeviceTrust: vi.fn<() => Promise<Record<string, boolean>>>(),
  engineUserTrust: vi.fn<() => Promise<Record<string, boolean>>>(),
  engineCrossSigningStatus: vi.fn<() => Promise<Record<string, boolean>>>(),
  engineExportRoomKeys: vi.fn<(params: { roomId: string | null }) => Promise<string>>(),
  engineImportRoomKeys: vi.fn<(params: { keysJson: string }) => Promise<unknown>>(),
}));

vi.mock('$generated/tauri/commands', () => commands);

const info: EngineInfo = {
  user_id: '@alice:example.org',
  device_id: 'DEVICE',
  curve25519_key: 'curve-key',
  ed25519_key: 'ed-key',
  store_path: '/tmp/store.sqlite3',
};

function makeClient(authedRequest = vi.fn<() => Promise<unknown>>()) {
  return { http: { authedRequest } } as never;
}

describe('RustIpcCrypto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commands.engineClose.mockResolvedValue(true);
    commands.engineMarkRequestSent.mockResolvedValue(undefined);
    commands.engineOutgoingRequests.mockResolvedValue([]);
    commands.engineReceiveSyncChanges.mockResolvedValue({
      to_device_events: [],
      room_keys_received: 0,
    });
  });

  it('maps a decrypted event onto the shape matrix-js-sdk expects', async () => {
    commands.engineDecryptEvent.mockResolvedValue({
      clear_event: JSON.stringify({ type: 'm.room.message', content: { body: 'hi' } }),
      sender_curve25519_key: 'sender-curve',
      claimed_ed25519_key: null,
      forwarding_curve25519_chain: [],
      shield: 'Verified',
      session_id: 'session',
    });
    const crypto = new RustIpcCrypto(makeClient(), info);

    const result = await crypto.decryptEvent({
      getRoomId: () => '!room:example.org',
      getEffectiveEvent: () => ({ event_id: '$e' }),
    } as never);

    expect(result.clearEvent).toEqual({ type: 'm.room.message', content: { body: 'hi' } });
    expect(result.senderCurve25519Key).toBe('sender-curve');
    // Absent keys must be undefined, not null: js-sdk reads them directly.
    expect(result.claimedEd25519Key).toBeUndefined();
  });

  it('refuses to decrypt an event with no room id', async () => {
    const crypto = new RustIpcCrypto(makeClient(), info);

    await expect(crypto.decryptEvent({ getRoomId: () => undefined } as never)).rejects.toThrow(
      'no room id'
    );
    expect(commands.engineDecryptEvent).not.toHaveBeenCalled();
  });

  it('encrypts with the device keys reported by engine_open', async () => {
    commands.engineEncryptEvent.mockResolvedValue(JSON.stringify({ ciphertext: 'abc' }));
    const makeEncrypted = vi.fn<() => void>();
    const crypto = new RustIpcCrypto(makeClient(), info);

    await crypto.encryptEvent(
      {
        getType: () => 'm.room.message',
        getContent: () => ({ body: 'hi' }),
        makeEncrypted,
      } as never,
      { roomId: '!room:example.org' } as never
    );

    expect(makeEncrypted).toHaveBeenCalledWith(
      'm.room.encrypted',
      { ciphertext: 'abc' },
      'curve-key',
      'ed-key'
    );
  });

  it('round-trips to-device messages through the engine as JSON strings', async () => {
    commands.engineReceiveSyncChanges.mockResolvedValue({
      to_device_events: [JSON.stringify({ type: 'm.room_key', sender: '@bob:example.org' })],
      room_keys_received: 1,
    });
    const crypto = new RustIpcCrypto(makeClient(), info);

    const processed = await crypto.preprocessToDeviceMessages([
      { type: 'm.room.encrypted', sender: '@bob:example.org', content: {} } as never,
    ]);

    const sent = commands.engineReceiveSyncChanges.mock.calls[0]?.[0];
    expect(sent?.request.to_device_events).toEqual([
      JSON.stringify({ type: 'm.room.encrypted', sender: '@bob:example.org', content: {} }),
    ]);
    expect(processed).toEqual([
      { message: { type: 'm.room_key', sender: '@bob:example.org' }, encryptionInfo: null },
    ]);
  });

  it('sends each queued request and marks it sent before the next', async () => {
    const order: string[] = [];
    const authedRequest = vi.fn<(method: string, path: string) => Promise<unknown>>(
      async (_method, path) => {
        order.push(`send:${path}`);
        return { one_time_key_counts: {} };
      }
    );
    commands.engineMarkRequestSent.mockImplementation(async () => {
      order.push('marked');
    });
    commands.engineOutgoingRequests.mockResolvedValueOnce([
      { request_id: 'req-1', kind: 'KeysUpload', body: '{"device_keys":{}}', event_type: null },
      {
        request_id: 'req-2',
        kind: 'ToDevice',
        body: '{"messages":{}}',
        event_type: 'm.room.encrypted',
      },
    ]);
    const crypto = new RustIpcCrypto(makeClient(authedRequest as never), info);

    crypto.onSyncCompleted();
    await vi.waitFor(() => expect(commands.engineMarkRequestSent).toHaveBeenCalledTimes(2));

    expect(order).toEqual([
      'send:/keys/upload',
      'marked',
      'send:/sendToDevice/m.room.encrypted/req-2',
      'marked',
    ]);
  });

  it('stops the pump and does not mark requests sent after stop', async () => {
    commands.engineOutgoingRequests.mockResolvedValue([
      { request_id: 'req-1', kind: 'KeysUpload', body: '{}', event_type: null },
    ]);
    const crypto = new RustIpcCrypto(makeClient(), info);

    crypto.stop();
    crypto.onSyncCompleted();
    await Promise.resolve();

    expect(commands.engineClose).toHaveBeenCalledOnce();
    expect(commands.engineMarkRequestSent).not.toHaveBeenCalled();
  });

  it('reports an unknown device as null rather than an unverified one', async () => {
    commands.engineDeviceTrust.mockResolvedValue({
      found: false,
      signed_by_owner: false,
      cross_signing_verified: false,
      local_verified: false,
    });
    const crypto = new RustIpcCrypto(makeClient(), info);

    expect(await crypto.getDeviceVerificationStatus('@bob:example.org', 'BOBDEVICE')).toBeNull();
  });

  it('maps device trust onto DeviceVerificationStatus, honouring the cross-signing setting', async () => {
    commands.engineDeviceTrust.mockResolvedValue({
      found: true,
      signed_by_owner: true,
      cross_signing_verified: true,
      local_verified: false,
    });
    const crypto = new RustIpcCrypto(makeClient(), info);

    const trusted = await crypto.getDeviceVerificationStatus('@bob:example.org', 'BOBDEVICE');
    expect(trusted?.signedByOwner).toBe(true);
    expect(trusted?.isVerified()).toBe(true);

    // With cross-signed devices distrusted, the same input must not be verified.
    crypto.setTrustCrossSignedDevices(false);
    const untrusted = await crypto.getDeviceVerificationStatus('@bob:example.org', 'BOBDEVICE');
    expect(untrusted?.isVerified()).toBe(false);
  });

  it('maps user trust onto UserVerificationStatus', async () => {
    commands.engineUserTrust.mockResolvedValue({
      known: true,
      cross_signing_verified: true,
      cross_signing_verified_before: true,
      needs_user_approval: false,
    });
    const crypto = new RustIpcCrypto(makeClient(), info);

    const status = await crypto.getUserVerificationStatus('@bob:example.org');
    expect(status.isVerified()).toBe(true);
    expect(status.wasCrossSigningVerified()).toBe(true);
    expect(status.needsUserApproval).toBe(false);
  });

  it('is only cross-signing ready when all three private keys are cached', async () => {
    const crypto = new RustIpcCrypto(makeClient(), info);

    commands.engineCrossSigningStatus.mockResolvedValue({
      master_key: true,
      self_signing_key: true,
      user_signing_key: true,
    });
    expect(await crypto.isCrossSigningReady()).toBe(true);

    commands.engineCrossSigningStatus.mockResolvedValue({
      master_key: true,
      self_signing_key: true,
      user_signing_key: false,
    });
    expect(await crypto.isCrossSigningReady()).toBe(false);
  });

  it('round-trips room keys in the standard export format', async () => {
    const session = { room_id: '!room:example.org', session_id: 'sess', session_key: 'key' };
    commands.engineExportRoomKeys.mockResolvedValue(JSON.stringify([session]));
    commands.engineImportRoomKeys.mockResolvedValue({ imported_count: 1, total_count: 1 });
    const crypto = new RustIpcCrypto(makeClient(), info);

    expect(await crypto.exportRoomKeys()).toEqual([session]);
    // A whole-account export must not narrow to a room.
    expect(commands.engineExportRoomKeys.mock.calls[0]?.[0]?.roomId).toBeNull();

    await crypto.exportRoomKeysForRoom('!room:example.org');
    expect(commands.engineExportRoomKeys.mock.calls[1]?.[0]?.roomId).toBe('!room:example.org');

    await crypto.importRoomKeysAsJson(JSON.stringify([session]));
    expect(commands.engineImportRoomKeys.mock.calls[0]?.[0]?.keysJson).toBe(
      JSON.stringify([session])
    );
  });

  it('names the missing member when an unimplemented part of the surface is used', () => {
    const crypto = new RustIpcCrypto(makeClient(), info);

    expect(() => crypto.getBackupDecryptor()).toThrow(CryptoNotImplementedError);
    expect(() => crypto.getBackupDecryptor()).toThrow('getBackupDecryptor');
  });
});
