import { TypedEventEmitter } from 'matrix-js-sdk/lib/models/typed-event-emitter';
import { decodeBase64, encodeBase64 } from 'matrix-js-sdk/lib/base64';
import {
  VerificationMethod,
  VerificationRequestEvent,
  type VerificationPhase,
  type VerificationRequest,
  type VerificationRequestEventHandlerMap,
  type Verifier,
} from '$types/matrix-sdk';
import {
  cancellingUserId,
  chosenMethod,
  EnginePhase,
  isPending,
  methodsFromCodes,
  otherPartySupportsMethod,
  toVerificationPhase,
  type EngineVerificationState,
} from './state';
import {
  EngineQrVerifier,
  EngineSasVerifier,
  type EngineCall,
  type QrState,
  type SasState,
} from './verifier';

/** The interface's getters are synchronous, so state is held as a refreshed snapshot. */
export class EngineVerificationRequest
  extends TypedEventEmitter<VerificationRequestEvent, VerificationRequestEventHandlerMap>
  implements VerificationRequest
{
  readonly #call: EngineCall;

  #state: EngineVerificationState;

  #verifier: EngineSasVerifier | EngineQrVerifier | undefined;

  #accepting = false;

  #declining = false;

  constructor(call: EngineCall, state: EngineVerificationState) {
    super();
    this.#call = call;
    this.#state = state;
    // js-sdk builds its verifier only on change, so an already-transitioned request has
    // none and its `phase` throws.
    this.#syncVerifier();
  }

  get #flow(): { userId: string; flowId: string } {
    return { userId: this.#state.otherUserId, flowId: this.#state.flowId };
  }

  #syncVerifier(): void {
    const verification = this.#state.verification;
    if (!verification) {
      if (this.#state.phase === EnginePhase.Done) this.#verifier?.settle(true);
      else if (this.#state.phase === EnginePhase.Cancelled) this.#verifier?.settle(false);
      return;
    }

    if (!this.#verifier) {
      if (verification.className === 'Sas') {
        this.#verifier = new EngineSasVerifier(
          this.#call,
          this.#flow,
          verification as SasState,
          this.#state.otherUserId
        );
      } else if (verification.className === 'Qr') {
        this.#verifier = new EngineQrVerifier(
          this.#call,
          this.#flow,
          verification as QrState,
          this.#state.otherUserId
        );
      }
    }

    // Every snapshot, including the first: the verifier emits ShowSas off these.
    if (this.#verifier instanceof EngineSasVerifier) {
      this.#verifier.onChange(verification as SasState);
    } else if (this.#verifier instanceof EngineQrVerifier) {
      this.#verifier.onChange(verification as QrState);
    }
  }

  async refresh(): Promise<void> {
    const next = (await this.#call(
      'verificationRequest.state',
      this.#flow
    )) as EngineVerificationState | null;
    if (!next) return;

    this.#state = next;
    this.#syncVerifier();
    this.emit(VerificationRequestEvent.Change);
  }

  apply(state: EngineVerificationState): void {
    this.#state = state;
    this.#syncVerifier();
    this.emit(VerificationRequestEvent.Change);
  }

  markDone(): void {
    this.#state = {
      ...this.#state,
      phase: EnginePhase.Done,
      isDone: true,
      verification: this.#state.verification
        ? { ...this.#state.verification, isDone: true }
        : this.#state.verification,
    };
    this.#syncVerifier();
    this.emit(VerificationRequestEvent.Change);
  }

  get transactionId(): string | undefined {
    return this.#state.flowId;
  }

  get roomId(): string | undefined {
    return this.#state.roomId ?? undefined;
  }

  get initiatedByMe(): boolean {
    return this.#state.weStarted;
  }

  get otherUserId(): string {
    return this.#state.otherUserId;
  }

  get otherDeviceId(): string | undefined {
    return this.#state.otherDeviceId ?? undefined;
  }

  get isSelfVerification(): boolean {
    return this.#state.isSelfVerification;
  }

  get phase(): VerificationPhase {
    return toVerificationPhase(this.#state, {
      accepting: this.#accepting,
      startedPhase: this.#verifier?.verificationPhase,
    });
  }

  get pending(): boolean {
    return isPending(this.#state, this.phase);
  }

  get accepting(): boolean {
    return this.#accepting;
  }

  get declining(): boolean {
    return this.#declining;
  }

  get timeout(): number | null {
    return this.#state.timeRemainingMillis;
  }

  get methods(): string[] {
    return methodsFromCodes(this.#state.theirSupportedMethods);
  }

  get chosenMethod(): string | null {
    return chosenMethod(this.#state, this.phase);
  }

  get verifier(): Verifier | undefined {
    return this.#verifier;
  }

  get cancellationCode(): string | null {
    return this.#state.cancelInfo?.cancelCode ?? null;
  }

  get cancellingUserId(): string | undefined {
    return cancellingUserId(this.#state);
  }

  otherPartySupportsMethod(method: string): boolean {
    return otherPartySupportsMethod(this.#state, method);
  }

  async accept(): Promise<void> {
    // Matches js-sdk: accepting outside Requested is a caller error, not a no-op.
    if (this.#state.phase !== EnginePhase.Requested || this.#accepting) {
      throw new Error(`Cannot accept a verification request in phase ${this.phase}`);
    }
    this.#accepting = true;
    try {
      await this.#call('verificationRequest.accept', {
        ...this.#flow,
        methods: this.#state.ourSupportedMethods ?? undefined,
      });
      await this.refresh();
    } finally {
      this.#accepting = false;
    }
    this.emit(VerificationRequestEvent.Change);
  }

  async cancel(params?: { reason?: string; code?: string }): Promise<void> {
    this.#declining = true;
    try {
      await this.#call('verificationRequest.cancel', { ...this.#flow, ...params });
      await this.refresh();
    } finally {
      this.#declining = false;
    }
    this.emit(VerificationRequestEvent.Change);
  }

  async startVerification(method: string): Promise<Verifier> {
    // Only SAS can be started this way; QR is entered through scanQRCode.
    if (method !== VerificationMethod.Sas) {
      throw new Error(`Unsupported verification method ${method}`);
    }

    await this.#call('verificationRequest.startSas', this.#flow);
    await this.refresh();

    if (!this.#verifier) throw new Error(`Starting ${method} produced no verifier`);
    return this.#verifier;
  }

  async scanQRCode(qrCodeData: Uint8ClampedArray): Promise<Verifier> {
    await this.#call('verificationRequest.scanQrCode', {
      ...this.#flow,
      // The engine decodes base64; a number array is rejected as a missing string.
      qrCodeData: encodeBase64(new Uint8Array(qrCodeData)),
    });
    await this.refresh();

    if (!(this.#verifier instanceof EngineQrVerifier)) {
      throw new Error('Scanning the QR code produced no verifier');
    }

    // Scanning alone tells them nothing; reciprocating is what they see.
    await this.#verifier.reciprocate();
    await this.refresh();
    return this.#verifier;
  }

  async generateQRCode(): Promise<Uint8ClampedArray | undefined> {
    // Returns the QR verification state, with the payload as base64 — not a byte array.
    const qr = (await this.#call('verificationRequest.generateQrCode', this.#flow)) as {
      qrCodeBytes?: string | null;
    } | null;
    if (!qr?.qrCodeBytes) return undefined;

    await this.refresh();
    return new Uint8ClampedArray(decodeBase64(qr.qrCodeBytes));
  }
}
