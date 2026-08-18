import * as RustSdkCryptoJs from '@matrix-org/matrix-sdk-crypto-wasm';
import { RustVerificationRequest } from 'matrix-js-sdk/lib/rust-crypto/verification';
import { logger } from 'matrix-js-sdk/lib/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graftWasmPrototypes } from './wasmClasses';
import type { HydrationContext } from './hydrate';

// Drives matrix-js-sdk's real `RustVerificationRequest` against engine-shaped payloads.
// Keep the fixtures in step with `request_state` / `sas_state` in matrix_crypto/verification.rs.

const FLOW_ID = '$flow:example.org';

const ctx = (): HydrationContext => ({
  call: vi.fn<HydrationContext['call']>(async () => undefined),
  queueOutgoing: vi.fn<HydrationContext['queueOutgoing']>(),
  watchChanges: vi.fn<HydrationContext['watchChanges']>(),
  trackVerification: vi.fn<HydrationContext['trackVerification']>(),
});

const sasPayload = (overrides: Record<string, unknown> = {}) => ({
  className: 'Sas',
  userId: '@me:example.org',
  deviceId: 'DEVICE',
  otherUserId: '@me:example.org',
  otherDeviceId: 'OTHER',
  flowId: FLOW_ID,
  roomId: null,
  weStarted: true,
  isSelfVerification: true,
  startedFromRequest: true,
  supportsEmoji: true,
  haveWeConfirmed: false,
  hasBeenAccepted: true,
  canBePresented: false,
  timedOut: false,
  isDone: false,
  isCancelled: false,
  cancelInfo: null,
  emoji: null,
  emojiIndex: null,
  decimals: null,
  ...overrides,
});

const requestPayload = (overrides: Record<string, unknown> = {}) => ({
  className: 'VerificationRequest',
  ownUserId: '@me:example.org',
  otherUserId: '@me:example.org',
  otherDeviceId: 'OTHER',
  flowId: FLOW_ID,
  roomId: null,
  phase: 3, // Transitioned
  weStarted: true,
  isSelfVerification: true,
  isPassive: false,
  isReady: true,
  isDone: false,
  isCancelled: false,
  timedOut: false,
  timeRemainingMillis: 600000,
  theirSupportedMethods: null,
  ourSupportedMethods: null,
  cancelInfo: null,
  verification: sasPayload(),
  ...overrides,
});

const wrap = (payload: Record<string, unknown>) => {
  const inner = graftWasmPrototypes(payload, ctx());
  return new RustVerificationRequest(
    logger,
    { userId: new RustSdkCryptoJs.UserId('@me:example.org') } as never,
    inner as never,
    { makeOutgoingRequest: vi.fn<() => Promise<void>>(async () => {}) } as never,
    ['m.sas.v1']
  );
};

describe('verification IPC contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the nested verification as a real wasm Sas so `instanceof` dispatch works', () => {
    const inner = graftWasmPrototypes(requestPayload(), ctx()) as unknown as {
      getVerification: () => unknown;
    };

    expect(inner.getVerification()).toBeInstanceOf(RustSdkCryptoJs.Sas);
  });

  it('does not throw on `phase` when the request has already transitioned', async () => {
    const request = wrap(requestPayload());
    await Promise.resolve();

    expect(() => request.phase).not.toThrow();
    expect(request.verifier).toBeDefined();
  });

  it('treats an absent supported-method list as "no message yet", not a crash', () => {
    const request = wrap(requestPayload({ theirSupportedMethods: null }));

    expect(() => request.otherPartySupportsMethod('m.sas.v1')).not.toThrow();
    expect(request.otherPartySupportsMethod('m.sas.v1')).toBe(false);
  });

  it('reports a to-device request as having no room, so it is not filtered out', () => {
    const inner = graftWasmPrototypes(requestPayload(), ctx()) as unknown as { roomId?: unknown };

    expect(inner.roomId).toBeUndefined();
  });

  it('leaves cancellation empty while the request is live', () => {
    const request = wrap(requestPayload());

    expect(request.cancellationCode).toBeNull();
    expect(request.cancellingUserId).toBeUndefined();
  });

  it('reads a cancellation through CancelInfo methods once one is present', () => {
    const request = wrap(
      requestPayload({
        isCancelled: true,
        phase: 5,
        cancelInfo: {
          className: 'CancelInfo',
          cancelCode: 'm.user',
          cancelledbyUs: true,
          reason: 'cancelled by user',
        },
      })
    );

    expect(request.cancellationCode).toBe('m.user');
    expect(request.cancellingUserId).toBe('@me:example.org');
  });

  it('reports SAS values as undefined before key exchange, so ShowSas is not latched early', () => {
    const sas = graftWasmPrototypes(sasPayload(), ctx()) as unknown as {
      emoji: () => unknown;
      decimals: () => unknown;
    };

    expect(sas.emoji()).toBeUndefined();
    expect(sas.decimals()).toBeUndefined();
  });

  it('surfaces emoji once the engine provides them', () => {
    const sas = graftWasmPrototypes(
      sasPayload({
        canBePresented: true,
        emoji: [{ symbol: '🐶', description: 'Dog' }],
        decimals: [1234, 5678, 9012],
      }),
      ctx()
    ) as unknown as { emoji: () => { symbol: string }[]; decimals: () => number[] };

    expect(sas.emoji().map((e) => e.symbol)).toEqual(['🐶']);
    expect(sas.decimals()).toEqual([1234, 5678, 9012]);
  });
});
