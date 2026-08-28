import { describe, expect, it } from 'vitest';
import { VerificationPhase, VerificationMethod } from '$types/matrix-sdk';
import {
  EnginePhase,
  chosenMethod,
  cancellingUserId,
  codeFromMethod,
  isPending,
  methodFromCode,
  methodsFromCodes,
  otherPartySupportsMethod,
  toVerificationPhase,
  type EngineVerificationState,
} from './state';

const state = (patch: Partial<EngineVerificationState> = {}): EngineVerificationState => ({
  ownUserId: '@me:example.org',
  otherUserId: '@them:example.org',
  otherDeviceId: 'THEIRDEVICE',
  flowId: '$flow',
  roomId: null,
  phase: EnginePhase.Requested,
  weStarted: false,
  isSelfVerification: false,
  isPassive: false,
  isReady: false,
  isDone: false,
  isCancelled: false,
  timedOut: false,
  timeRemainingMillis: 600000,
  theirSupportedMethods: null,
  ourSupportedMethods: null,
  cancelInfo: null,
  verification: null,
  ...patch,
});

describe('verification method codes', () => {
  // These must track matrix-sdk-crypto's VerificationMethod ordering, which the Rust
  // engine's method_from_code mirrors. A shift here silently breaks QR negotiation.
  it('matches the engine ordering', () => {
    expect(methodFromCode(0)).toBe(VerificationMethod.Sas);
    expect(methodFromCode(1)).toBe(VerificationMethod.ScanQrCode);
    expect(methodFromCode(2)).toBe(VerificationMethod.ShowQrCode);
    expect(methodFromCode(3)).toBe(VerificationMethod.Reciprocate);
    expect(methodFromCode(4)).toBeUndefined();
  });

  it('round-trips every known method', () => {
    [
      VerificationMethod.Sas,
      VerificationMethod.ScanQrCode,
      VerificationMethod.ShowQrCode,
      VerificationMethod.Reciprocate,
    ].forEach((method) => {
      expect(methodFromCode(codeFromMethod(method) as number)).toBe(method);
    });
  });

  it('drops codes it cannot name rather than emitting undefined entries', () => {
    expect(methodsFromCodes([0, 99, 3])).toEqual([
      VerificationMethod.Sas,
      VerificationMethod.Reciprocate,
    ]);
    expect(methodsFromCodes(null)).toEqual([]);
  });
});

describe('toVerificationPhase', () => {
  it('folds Created and Requested into Requested', () => {
    expect(toVerificationPhase(state({ phase: EnginePhase.Created }), { accepting: false })).toBe(
      VerificationPhase.Requested
    );
    expect(toVerificationPhase(state({ phase: EnginePhase.Requested }), { accepting: false })).toBe(
      VerificationPhase.Requested
    );
  });

  // The ready event is still in flight, so the request is not yet Ready to the caller.
  it('keeps a locally-accepting request in Requested', () => {
    const ready = state({ phase: EnginePhase.Ready });
    expect(toVerificationPhase(ready, { accepting: true })).toBe(VerificationPhase.Requested);
    expect(toVerificationPhase(ready, { accepting: false })).toBe(VerificationPhase.Ready);
  });

  it('defers to the verifier once transitioned', () => {
    const transitioned = state({ phase: EnginePhase.Transitioned });
    expect(
      toVerificationPhase(transitioned, { accepting: false, startedPhase: VerificationPhase.Done })
    ).toBe(VerificationPhase.Done);
    expect(toVerificationPhase(transitioned, { accepting: false })).toBe(VerificationPhase.Started);
  });

  it('maps the terminal phases', () => {
    expect(toVerificationPhase(state({ phase: EnginePhase.Done }), { accepting: false })).toBe(
      VerificationPhase.Done
    );
    expect(toVerificationPhase(state({ phase: EnginePhase.Cancelled }), { accepting: false })).toBe(
      VerificationPhase.Cancelled
    );
  });

  it('throws on a phase it does not know instead of guessing', () => {
    expect(() => toVerificationPhase(state({ phase: 99 }), { accepting: false })).toThrow(
      'Unknown verification phase 99'
    );
  });
});

describe('isPending', () => {
  it('is false for a passive request regardless of phase', () => {
    expect(isPending(state({ isPassive: true }), VerificationPhase.Requested)).toBe(false);
  });

  it('is false once done or cancelled', () => {
    expect(isPending(state(), VerificationPhase.Done)).toBe(false);
    expect(isPending(state(), VerificationPhase.Cancelled)).toBe(false);
    expect(isPending(state(), VerificationPhase.Ready)).toBe(true);
  });
});

describe('chosenMethod', () => {
  it('names the method only once started', () => {
    const sas = state({ verification: { className: 'Sas' } });
    expect(chosenMethod(sas, VerificationPhase.Started)).toBe(VerificationMethod.Sas);
    expect(chosenMethod(sas, VerificationPhase.Ready)).toBeNull();

    const qr = state({ verification: { className: 'Qr' } });
    expect(chosenMethod(qr, VerificationPhase.Started)).toBe(VerificationMethod.Reciprocate);
    expect(chosenMethod(state(), VerificationPhase.Started)).toBeNull();
  });
});

describe('otherPartySupportsMethod', () => {
  // Absent is not the same as empty: before the other side speaks we must not claim support.
  it('is false when the other side has not spoken', () => {
    expect(otherPartySupportsMethod(state(), VerificationMethod.Sas)).toBe(false);
  });

  it('reads the advertised codes', () => {
    const advertised = state({ theirSupportedMethods: [0, 3] });
    expect(otherPartySupportsMethod(advertised, VerificationMethod.Sas)).toBe(true);
    expect(otherPartySupportsMethod(advertised, VerificationMethod.Reciprocate)).toBe(true);
    expect(otherPartySupportsMethod(advertised, VerificationMethod.ShowQrCode)).toBe(false);
  });

  it('is false for a method it cannot map', () => {
    expect(otherPartySupportsMethod(state({ theirSupportedMethods: [0] }), 'm.nonsense')).toBe(
      false
    );
  });
});

describe('cancellingUserId', () => {
  it('attributes the cancellation to the right side', () => {
    expect(cancellingUserId(state())).toBeUndefined();
    expect(cancellingUserId(state({ cancelInfo: { cancelledbyUs: true } }))).toBe(
      '@me:example.org'
    );
    expect(cancellingUserId(state({ cancelInfo: { cancelledbyUs: false } }))).toBe(
      '@them:example.org'
    );
  });
});
