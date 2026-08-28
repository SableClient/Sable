import { describe, expect, it, vi } from 'vitest';
import {
  VerificationPhase,
  VerifierEvent,
  type ShowQrCodeCallbacks,
  type ShowSasCallbacks,
} from '$types/matrix-sdk';
import { EngineQrVerifier, EngineSasVerifier } from './verifier';

const flow = { userId: '@them:e.org', flowId: '$f' };

describe('EngineSasVerifier', () => {
  // Reading the digits straight after accepting yields nothing: they arrive later.
  it('emits ShowSas when the digits arrive, not when accept is sent', async () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const verifier = new EngineSasVerifier(call, flow, {}, '@them:e.org');
    const shown = vi.fn<(sas: ShowSasCallbacks) => void>();
    verifier.on(VerifierEvent.ShowSas, shown);

    verifier.onChange({ canBePresented: false });
    expect(shown).not.toHaveBeenCalled();
    expect(verifier.getShowSasCallbacks()).toBeNull();

    verifier.onChange({
      emoji: [{ symbol: '🐶', description: 'Dog' }],
      decimals: [1, 2, 3],
    });

    expect(shown).toHaveBeenCalledOnce();
    expect(verifier.getShowSasCallbacks()?.sas).toEqual({
      emoji: [['🐶', 'Dog']],
      decimal: [1, 2, 3],
    });
  });

  it('emits once even as further snapshots arrive', () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const verifier = new EngineSasVerifier(call, flow, {}, '@them:e.org');
    const shown = vi.fn<(sas: ShowSasCallbacks) => void>();
    verifier.on(VerifierEvent.ShowSas, shown);

    verifier.onChange({ decimals: [1, 2, 3] });
    verifier.onChange({ decimals: [1, 2, 3], haveWeConfirmed: true });

    expect(shown).toHaveBeenCalledOnce();
  });

  // Resolving early would let the UI close the prompt before the peer confirmed.
  it('resolves verify only once the flow is done', async () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const verifier = new EngineSasVerifier(call, flow, {}, '@them:e.org');

    let settled = false;
    const verifying = verifier.verify().then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    verifier.onChange({ isDone: true });
    await verifying;
    expect(settled).toBe(true);
  });

  it('confirms and cancels through the engine with the right codes', async () => {
    const call = vi.fn<(m: string, a?: Record<string, unknown>) => Promise<unknown>>(
      async () => null
    );
    const verifier = new EngineSasVerifier(call, flow, {}, '@them:e.org');
    verifier.onChange({ decimals: [1, 2, 3] });

    await verifier.getShowSasCallbacks()?.confirm();
    expect(call).toHaveBeenCalledWith('sas.confirm', flow);

    verifier.getShowSasCallbacks()?.mismatch();
    expect(call).toHaveBeenCalledWith('sas.cancel', { ...flow, code: 'm.mismatched_sas' });
    expect(verifier.hasBeenCancelled).toBe(true);
  });

  // js-sdk reports Started throughout SAS; Done is the request's phase, not the verifier's.
  it('reports Started while running, leaving Done to the request', () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const verifier = new EngineSasVerifier(call, flow, {}, '@them:e.org');

    expect(verifier.verificationPhase).toBe(VerificationPhase.Started);
    verifier.onChange({ isDone: true });
    expect(verifier.verificationPhase).toBe(VerificationPhase.Started);
  });

  it('rejects verify when the flow is cancelled', async () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const verifier = new EngineSasVerifier(call, flow, {}, '@them:e.org');
    const verifying = verifier.verify();

    verifier.onChange({ isCancelled: true });

    await expect(verifying).rejects.toThrow('Verification cancelled');
    expect(verifier.hasBeenCancelled).toBe(true);
  });
});

describe('EngineQrVerifier', () => {
  it('offers reciprocate callbacks only once our code has been scanned', () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const verifier = new EngineQrVerifier(call, flow, {}, '@them:e.org');
    const shown = vi.fn<(qr: ShowQrCodeCallbacks) => void>();
    verifier.on(VerifierEvent.ShowReciprocateQr, shown);

    verifier.onChange({ hasBeenScanned: false });
    expect(verifier.getReciprocateQrCodeCallbacks()).toBeNull();

    verifier.onChange({ hasBeenScanned: true });
    expect(shown).toHaveBeenCalledOnce();
    expect(verifier.getReciprocateQrCodeCallbacks()).not.toBeNull();
  });
});
