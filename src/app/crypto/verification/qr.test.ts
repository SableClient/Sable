import { describe, expect, it, vi } from 'vitest';
import { encodeBase64 } from 'matrix-js-sdk/lib/base64';
import { VerificationPhase } from '$types/matrix-sdk';
import { EngineVerificationRequest } from './request';
import { EnginePhase, type EngineVerificationState } from './state';
import { EngineQrVerifier } from './verifier';

const state = (patch: Partial<EngineVerificationState> = {}): EngineVerificationState => ({
  ownUserId: '@me:e.org',
  otherUserId: '@them:e.org',
  otherDeviceId: 'THEIRS',
  flowId: '$f',
  roomId: null,
  phase: EnginePhase.Ready,
  weStarted: false,
  isSelfVerification: true,
  isPassive: false,
  isReady: true,
  isDone: false,
  isCancelled: false,
  timedOut: false,
  timeRemainingMillis: 600000,
  theirSupportedMethods: [1, 2, 3],
  ourSupportedMethods: [1, 2, 3],
  cancelInfo: null,
  verification: null,
  ...patch,
});

describe('QR: showing our code', () => {
  // The payload is base64, not a byte array; reading it as an array yields a dead code.
  it('decodes the base64 payload the engine returns', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    const call = vi.fn<(m: string) => Promise<unknown>>(async (method) =>
      method === 'verificationRequest.generateQrCode'
        ? { className: 'Qr', qrCodeBytes: encodeBase64(bytes) }
        : state()
    );

    const qr = await new EngineVerificationRequest(call, state()).generateQRCode();

    expect(qr).toBeInstanceOf(Uint8ClampedArray);
    expect(Array.from(qr ?? [])).toEqual([1, 2, 3, 250]);
  });

  it('returns undefined when the engine cannot produce a code', async () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);

    await expect(
      new EngineVerificationRequest(call, state()).generateQRCode()
    ).resolves.toBeUndefined();
  });
});

describe('QR: scanning their code', () => {
  const scanning = () => {
    const calls: { method: string; args?: Record<string, unknown> }[] = [];
    const call = vi.fn<(m: string, a?: Record<string, unknown>) => Promise<unknown>>(
      async (method, args) => {
        calls.push({ method, args });
        if (method === 'verificationRequest.state') {
          return state({
            phase: EnginePhase.Transitioned,
            verification: { className: 'Qr' },
          });
        }
        return { className: 'Qr' };
      }
    );
    return { call, calls };
  };

  it('sends the scanned payload as base64', async () => {
    const { call, calls } = scanning();
    await new EngineVerificationRequest(call, state()).scanQRCode(new Uint8ClampedArray([9, 8, 7]));

    const scan = calls.find((c) => c.method === 'verificationRequest.scanQrCode');
    expect(scan?.args?.qrCodeData).toBe(encodeBase64(new Uint8Array([9, 8, 7])));
  });

  // Scanning alone tells them nothing; without this our side thinks it succeeded.
  it('reciprocates after scanning', async () => {
    const { call, calls } = scanning();
    const verifier = await new EngineVerificationRequest(call, state()).scanQRCode(
      new Uint8ClampedArray([1])
    );

    expect(calls.map((c) => c.method)).toContain('qr.reciprocate');
    expect(verifier).toBeInstanceOf(EngineQrVerifier);
  });
});

describe('QR verifier phase', () => {
  it('maps the engine state ordinals as js-sdk does', () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const phases: [number, VerificationPhase][] = [
      [0, VerificationPhase.Ready],
      [1, VerificationPhase.Started],
      [2, VerificationPhase.Started],
      [3, VerificationPhase.Started],
      [4, VerificationPhase.Done],
      [5, VerificationPhase.Cancelled],
    ];

    phases.forEach(([code, phase]) => {
      const verifier = new EngineQrVerifier(call, { userId: '@t:e', flowId: '$f' }, {}, '@t:e');
      verifier.onChange({ state: code });
      expect(verifier.verificationPhase).toBe(phase);
    });
  });
});
