import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LivekitMatrixKeyProvider, isLivekitE2EESupported } from './livekitMatrixKeyProvider';
import type { CallEncryptionKey } from './callTransport';

const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const key = (identity: string, keyIndex: number, bytes: number[]): CallEncryptionKey => ({
  identity,
  keyIndex,
  key: new Uint8Array(bytes) as Uint8Array<ArrayBuffer>,
});

const spyOnSetEncryptionKey = (provider: LivekitMatrixKeyProvider) =>
  vi.spyOn(
    provider as unknown as {
      onSetEncryptionKey: (material: CryptoKey, identity: string, index: number) => void;
    },
    'onSetEncryptionKey'
  );

describe('LivekitMatrixKeyProvider', () => {
  const importedKey = { imported: true } as unknown as CryptoKey;
  const importKey = vi.fn<typeof crypto.subtle.importKey>().mockResolvedValue(importedKey);

  beforeEach(() => {
    importKey.mockClear();
    vi.stubGlobal('crypto', { subtle: { importKey } });
  });

  it('forwards HKDF material with the identity and index the pipeline reported', async () => {
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = spyOnSetEncryptionKey(provider);
    const own = key('hashed-member', 7, [1, 2, 3, 4]);

    // livekit-client stores at `cryptoKeyRing[keyIndex % keyringSize]` and caps
    // the ring at 256, so only 256 keeps two live indices off one slot.
    expect(provider.getOptions()).toMatchObject({
      ratchetWindowSize: 10,
      keyringSize: 256,
      sharedKey: false,
    });

    provider.setKey(own, true);
    await vi.waitFor(() => expect(onSetEncryptionKey).toHaveBeenCalledOnce());

    expect(importKey).toHaveBeenCalledWith('raw', own.key, 'HKDF', false, [
      'deriveBits',
      'deriveKey',
    ]);
    expect(onSetEncryptionKey).toHaveBeenCalledWith(importedKey, 'hashed-member', 7);
    expect(provider.getKeyState()).toEqual({
      ready: true,
      localOutboundIdentity: 'hashed-member',
      keyIndex: 7,
      lastImportFailure: null,
    });
  });

  it('does not expose raw key material through the key ring', async () => {
    const provider = new LivekitMatrixKeyProvider();
    const raw = key('member', 3, [9, 8, 7]);

    provider.setKey(raw, false);
    await vi.waitFor(() => expect(provider.getKeys()).toHaveLength(1));

    expect(provider.getKeys()[0]?.key).toBe(importedKey);
    expect(provider.getKeys()[0]?.key).not.toBe(raw.key);
  });

  it('does not forward an import that completes after a reset', async () => {
    const pendingImport = deferred<CryptoKey>();
    importKey.mockImplementationOnce(() => pendingImport.promise);
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = spyOnSetEncryptionKey(provider);

    provider.setKey(key('member', 1, [1]), true);
    await vi.waitFor(() => expect(importKey).toHaveBeenCalledOnce());
    provider.reset();
    pendingImport.resolve(importedKey);
    await Promise.resolve();
    await Promise.resolve();

    expect(onSetEncryptionKey).not.toHaveBeenCalled();
    expect(provider.getKeyState()).toEqual({
      ready: false,
      localOutboundIdentity: null,
      keyIndex: null,
      lastImportFailure: null,
    });
  });

  it('applies keys in the order they were reported when imports complete out of order', async () => {
    const firstImport = deferred<CryptoKey>();
    const secondImport = deferred<CryptoKey>();
    importKey
      .mockImplementationOnce(() => firstImport.promise)
      .mockImplementationOnce(() => secondImport.promise);
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = spyOnSetEncryptionKey(provider);

    provider.setKey(key('member', 1, [1]), true);
    provider.setKey(key('member', 2, [2]), true);
    await vi.waitFor(() => expect(importKey).toHaveBeenCalledTimes(2));

    secondImport.resolve(importedKey);
    await Promise.resolve();
    expect(onSetEncryptionKey).not.toHaveBeenCalled();
    firstImport.resolve(importedKey);
    await vi.waitFor(() => expect(onSetEncryptionKey).toHaveBeenCalledTimes(2));

    expect(onSetEncryptionKey.mock.calls[0]).toEqual([importedKey, 'member', 1]);
    expect(onSetEncryptionKey.mock.calls[1]).toEqual([importedKey, 'member', 2]);
    expect(provider.getKeyState().keyIndex).toBe(2);
  });

  it('applies a lower index for the same identity, since a rejoin restarts the ring at 0', async () => {
    // A key index is a ring slot, not a sequence. The sender writes it into
    // every frame, so dropping a key for a non-increasing index leaves that
    // peer's media undecryptable for the rest of the call.
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = spyOnSetEncryptionKey(provider);

    provider.setKey(key('remote-member', 5, [1]), false);
    provider.setKey(key('remote-member', 0, [2]), false);
    provider.setKey(key('remote-member', 0, [3]), false);
    await vi.waitFor(() => expect(onSetEncryptionKey).toHaveBeenCalledTimes(3));

    expect(onSetEncryptionKey.mock.calls.map((call) => call[2])).toEqual([5, 0, 0]);
  });

  it('applies a lower index for our own key too, so a rejoin can still publish', async () => {
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = spyOnSetEncryptionKey(provider);

    provider.setKey(key('local-member', 3, [1]), true);
    await vi.waitFor(() => expect(provider.getKeyState().keyIndex).toBe(3));

    provider.setKey(key('local-member', 0, [2]), true);
    await vi.waitFor(() => expect(onSetEncryptionKey).toHaveBeenCalledTimes(2));

    expect(onSetEncryptionKey).toHaveBeenLastCalledWith(importedKey, 'local-member', 0);
    expect(provider.getKeyState()).toMatchObject({ ready: true, keyIndex: 0 });
  });

  it('only lets our own key decide readiness', async () => {
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = spyOnSetEncryptionKey(provider);

    provider.setKey(key('remote-member', 10, [1]), false);
    provider.setKey(key('local-member', 1, [2]), true);
    await vi.waitFor(() => expect(onSetEncryptionKey).toHaveBeenCalledTimes(2));

    expect(onSetEncryptionKey).toHaveBeenNthCalledWith(1, importedKey, 'remote-member', 10);
    expect(onSetEncryptionKey).toHaveBeenNthCalledWith(2, importedKey, 'local-member', 1);
    expect(provider.getKeyState()).toMatchObject({
      ready: true,
      localOutboundIdentity: 'local-member',
      keyIndex: 1,
      lastImportFailure: null,
    });
  });

  it('records a safe failure when key import is rejected', async () => {
    importKey.mockRejectedValueOnce(new Error('raw key internals'));
    const provider = new LivekitMatrixKeyProvider();

    provider.setKey(key('member', 1, [1]), true);

    await vi.waitFor(() => expect(provider.getKeyState().lastImportFailure).toBe('import-failed'));
    expect(JSON.stringify(provider.getKeyState())).not.toContain('raw key internals');

    provider.setKey(key('member', 2, [2]), true);
    await vi.waitFor(() => expect(provider.getKeyState().ready).toBe(true));
    expect(provider.getKeyState().lastImportFailure).toBeNull();
  });

  it('records a safe failure when WebCrypto import support is missing', async () => {
    vi.stubGlobal('crypto', { subtle: {} });
    const provider = new LivekitMatrixKeyProvider();

    provider.setKey(key('member', 1, [1]), false);

    await vi.waitFor(() =>
      expect(provider.getKeyState().lastImportFailure).toBe('webcrypto-unavailable')
    );
  });
});

describe('isLivekitE2EESupported', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { subtle: { importKey: vi.fn<typeof crypto.subtle.importKey>() } });
  });

  it('fails closed when the current LiveKit API reports unsupported E2EE', () => {
    Object.defineProperty(window, 'RTCRtpScriptTransform', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'RTCRtpSender', {
      configurable: true,
      value: undefined,
    });

    expect(isLivekitE2EESupported()).toBe(false);
  });

  it('reports support when LiveKit and WebCrypto are available', () => {
    Object.defineProperty(window, 'RTCRtpScriptTransform', {
      configurable: true,
      value: vi.fn<() => void>(),
    });

    expect(isLivekitE2EESupported()).toBe(true);
  });
});
