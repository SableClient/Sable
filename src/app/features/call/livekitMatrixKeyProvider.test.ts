import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MatrixRTCSessionEvent } from '$types/matrix-sdk';
import { LivekitMatrixKeyProvider, isLivekitE2EESupported } from './livekitMatrixKeyProvider';

type EncryptionKeyChangedHandler = (
  key: Uint8Array<ArrayBuffer>,
  keyIndex: number,
  membershipParts: unknown,
  rtcBackendIdentity: string
) => void;

type SessionOn = (event: MatrixRTCSessionEvent, handler: EncryptionKeyChangedHandler) => void;

type TestSession = {
  on: Mock<SessionOn>;
  off: Mock<SessionOn>;
  reemitEncryptionKeys: Mock<() => void>;
};

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

const session = (): TestSession => ({
  on: vi.fn<SessionOn>(),
  off: vi.fn<SessionOn>(),
  reemitEncryptionKeys: vi.fn<() => void>(),
});

const handlerFor = (testSession: TestSession): EncryptionKeyChangedHandler =>
  testSession.on.mock.calls.find(
    ([event]) => event === MatrixRTCSessionEvent.EncryptionKeyChanged
  )?.[1] as EncryptionKeyChangedHandler;

describe('LivekitMatrixKeyProvider', () => {
  const localIdentity = { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' };
  const localParts = { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' };
  const remoteParts = { userId: '@bob:example.org', deviceId: 'BOBDEVICE' };
  const importedKey = { imported: true } as unknown as CryptoKey;
  const importKey = vi.fn<typeof crypto.subtle.importKey>().mockResolvedValue(importedKey);

  beforeEach(() => {
    importKey.mockClear();
    vi.stubGlobal('crypto', { subtle: { importKey } });
  });

  it('attaches, re-emits tracked keys, and forwards HKDF material with identity and index', async () => {
    const testSession = session();
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = vi.spyOn(
      provider as unknown as {
        onSetEncryptionKey: (key: CryptoKey, identity: string, index: number) => void;
      },
      'onSetEncryptionKey'
    );
    const matrixKey = new Uint8Array([1, 2, 3, 4]);

    expect(provider.getOptions()).toMatchObject({
      ratchetWindowSize: 10,
      keyringSize: 256,
      sharedKey: false,
    });

    provider.attach(testSession as never, localIdentity);

    expect(testSession.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function)
    );
    expect(testSession.reemitEncryptionKeys).toHaveBeenCalledOnce();

    handlerFor(testSession)(matrixKey, 7, localParts, 'hashed-member');
    await vi.waitFor(() => expect(onSetEncryptionKey).toHaveBeenCalledOnce());

    expect(importKey).toHaveBeenCalledWith('raw', matrixKey, 'HKDF', false, [
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

  it('removes the old session listener before attaching a new one', () => {
    const oldSession = session();
    const newSession = session();
    const provider = new LivekitMatrixKeyProvider();

    provider.attach(oldSession as never, localIdentity);
    const oldHandler = handlerFor(oldSession);
    provider.attach(newSession as never, localIdentity);

    expect(oldSession.off).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      oldHandler
    );
    expect(newSession.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      oldHandler
    );
  });

  it('detaches the exact listener and does not expose raw key material', async () => {
    const testSession = session();
    const provider = new LivekitMatrixKeyProvider();
    const rawKey = new Uint8Array([9, 8, 7]);

    provider.attach(testSession as never, localIdentity);
    const handler = handlerFor(testSession);
    handler(rawKey, 3, {}, 'member');
    await vi.waitFor(() => expect(provider.getKeys()).toHaveLength(1));
    provider.detach();

    expect(testSession.off).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      handler
    );
    expect(provider.getKeys()[0]?.key).toBe(importedKey);
    expect(provider.getKeys()[0]?.key).not.toBe(rawKey);
  });

  it('does not forward an import that completes after detach', async () => {
    const testSession = session();
    const pendingImport = deferred<CryptoKey>();
    importKey.mockImplementationOnce(() => pendingImport.promise);
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = vi.spyOn(
      provider as unknown as {
        onSetEncryptionKey: (key: CryptoKey, identity: string, index: number) => void;
      },
      'onSetEncryptionKey'
    );

    provider.attach(testSession as never, localIdentity);
    handlerFor(testSession)(new Uint8Array([1]), 1, {}, 'member');
    await vi.waitFor(() => expect(importKey).toHaveBeenCalledOnce());
    provider.detach();
    pendingImport.resolve(importedKey);
    await Promise.resolve();
    await Promise.resolve();

    expect(onSetEncryptionKey).not.toHaveBeenCalled();
  });

  it('does not forward an import that completes after attaching a replacement session', async () => {
    const oldSession = session();
    const newSession = session();
    const pendingImport = deferred<CryptoKey>();
    importKey.mockImplementationOnce(() => pendingImport.promise);
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = vi.spyOn(
      provider as unknown as {
        onSetEncryptionKey: (key: CryptoKey, identity: string, index: number) => void;
      },
      'onSetEncryptionKey'
    );

    provider.attach(oldSession as never, localIdentity);
    handlerFor(oldSession)(new Uint8Array([1]), 1, {}, 'old-member');
    await vi.waitFor(() => expect(importKey).toHaveBeenCalledOnce());
    provider.attach(newSession as never, localIdentity);
    pendingImport.resolve(importedKey);
    await Promise.resolve();
    await Promise.resolve();

    expect(onSetEncryptionKey).not.toHaveBeenCalled();
  });

  it('keeps the effective key index from regressing when imports complete out of order', async () => {
    const testSession = session();
    const firstImport = deferred<CryptoKey>();
    const secondImport = deferred<CryptoKey>();
    importKey
      .mockImplementationOnce(() => firstImport.promise)
      .mockImplementationOnce(() => secondImport.promise);
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = vi.spyOn(
      provider as unknown as {
        onSetEncryptionKey: (key: CryptoKey, identity: string, index: number) => void;
      },
      'onSetEncryptionKey'
    );

    provider.attach(testSession as never, localIdentity);
    const handler = handlerFor(testSession);
    handler(new Uint8Array([1]), 1, localParts, 'member');
    handler(new Uint8Array([2]), 2, localParts, 'member');
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

  it('tracks key-index regression independently for each participant', async () => {
    const testSession = session();
    const provider = new LivekitMatrixKeyProvider();
    const onSetEncryptionKey = vi.spyOn(
      provider as unknown as {
        onSetEncryptionKey: (key: CryptoKey, identity: string, index: number) => void;
      },
      'onSetEncryptionKey'
    );

    provider.attach(testSession as never, localIdentity);
    const handler = handlerFor(testSession);
    handler(new Uint8Array([1]), 10, remoteParts, 'remote-member');
    handler(new Uint8Array([2]), 1, localParts, 'local-member');

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
    const testSession = session();
    importKey.mockRejectedValueOnce(new Error('raw key internals'));
    const provider = new LivekitMatrixKeyProvider();

    provider.attach(testSession as never, localIdentity);
    handlerFor(testSession)(new Uint8Array([1]), 1, localParts, 'member');

    await vi.waitFor(() => expect(provider.getKeyState().lastImportFailure).toBe('import-failed'));
    expect(JSON.stringify(provider.getKeyState())).not.toContain('raw key internals');

    handlerFor(testSession)(new Uint8Array([2]), 2, localParts, 'member');
    await vi.waitFor(() => expect(provider.getKeyState().ready).toBe(true));
    expect(provider.getKeyState().lastImportFailure).toBeNull();
  });

  it('records a safe failure when WebCrypto import support is missing', async () => {
    vi.stubGlobal('crypto', { subtle: {} });
    const testSession = session();
    const provider = new LivekitMatrixKeyProvider();

    provider.attach(testSession as never, localIdentity);
    handlerFor(testSession)(new Uint8Array([1]), 1, {}, 'member');

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
