import { TypedEventEmitter } from 'matrix-js-sdk/lib/models/typed-event-emitter';
import {
  VerificationPhase,
  VerifierEvent,
  type GeneratedSas,
  type ShowQrCodeCallbacks,
  type ShowSasCallbacks,
  type Verifier,
  type VerifierEventHandlerMap,
} from '$types/matrix-sdk';

export type EngineCall = (method: string, args?: Record<string, unknown>) => Promise<unknown>;

export type SasState = {
  className?: string;
  canBePresented?: boolean;
  haveWeConfirmed?: boolean;
  isDone?: boolean;
  isCancelled?: boolean;
  emoji?: { symbol: string; description: string }[] | null;
  decimals?: number[] | null;
};

export type QrState = {
  className?: string;
  hasBeenScanned?: boolean;
  hasBeenConfirmed?: boolean;
  reciprocated?: boolean;
  isDone?: boolean;
  isCancelled?: boolean;
  /** QrVerificationState ordinal; see qr_state_code in matrix_crypto/verification.rs. */
  state?: number;
};

const QrVerificationState = {
  Started: 0,
  Scanned: 1,
  Confirmed: 2,
  Reciprocated: 3,
  Done: 4,
  Cancelled: 5,
} as const;

type Flow = { userId: string; flowId: string };

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

abstract class EngineVerifier<TState>
  extends TypedEventEmitter<VerifierEvent, VerifierEventHandlerMap>
  implements Verifier
{
  protected readonly call: EngineCall;

  protected readonly flow: Flow;

  protected state: TState;

  protected readonly completion = deferred();

  #cancelled = false;

  readonly #userId: string;

  constructor(call: EngineCall, flow: Flow, state: TState, userId: string) {
    super();
    this.call = call;
    this.flow = flow;
    this.state = state;
    this.#userId = userId;
    // Nothing awaits this until verify() does; an unhandled rejection would crash first.
    this.completion.promise.catch(() => undefined);
  }

  get hasBeenCancelled(): boolean {
    return this.#cancelled;
  }

  get userId(): string {
    return this.#userId;
  }

  protected markCancelled(): void {
    this.#cancelled = true;
  }

  settle(done: boolean): void {
    if (done) {
      this.completion.resolve();
      return;
    }
    this.markCancelled();
    this.completion.reject(new Error('Verification cancelled'));
  }

  abstract onChange(state: TState): void;

  abstract get verificationPhase(): VerificationPhase;

  abstract verify(): Promise<void>;

  cancel(error: Error): void {
    this.markCancelled();
    void this.call(this.cancelMethod, this.flow);
    this.completion.reject(error);
    this.emit(VerifierEvent.Cancel, error);
  }

  protected abstract get cancelMethod(): string;

  getShowSasCallbacks(): ShowSasCallbacks | null {
    return null;
  }

  getReciprocateQrCodeCallbacks(): ShowQrCodeCallbacks | null {
    return null;
  }
}

/** The SAS digits only exist once the other side answers, hence the change handler. */
export class EngineSasVerifier extends EngineVerifier<SasState> {
  #callbacks: ShowSasCallbacks | null = null;

  protected get cancelMethod(): string {
    return 'sas.cancel';
  }

  get verificationPhase(): VerificationPhase {
    return VerificationPhase.Started;
  }

  async verify(): Promise<void> {
    await this.call('sas.accept', this.flow);
    // Resolves only once both sides have confirmed, matching js-sdk.
    await this.completion.promise;
  }

  onChange(state: SasState): void {
    this.state = state;

    if (state.isCancelled) {
      this.markCancelled();
      this.completion.reject(new Error('Verification cancelled'));
      return;
    }

    if (!this.#callbacks) {
      const sas = generatedSas(state);
      if (sas) {
        this.#callbacks = this.#buildCallbacks(sas);
        this.emit(VerifierEvent.ShowSas, this.#callbacks);
      }
    }

    if (state.isDone) this.completion.resolve();
  }

  #buildCallbacks(sas: GeneratedSas): ShowSasCallbacks {
    return {
      sas,
      confirm: async () => {
        await this.call('sas.confirm', this.flow);
      },
      mismatch: () => {
        this.markCancelled();
        void this.call('sas.cancel', { ...this.flow, code: 'm.mismatched_sas' });
      },
      cancel: () => {
        this.markCancelled();
        void this.call('sas.cancel', { ...this.flow, code: 'm.user' });
      },
    };
  }

  getShowSasCallbacks(): ShowSasCallbacks | null {
    return this.#callbacks;
  }
}

export class EngineQrVerifier extends EngineVerifier<QrState> {
  #callbacks: ShowQrCodeCallbacks | null = null;

  protected get cancelMethod(): string {
    return 'qr.cancel';
  }

  get verificationPhase(): VerificationPhase {
    switch (this.state.state) {
      case QrVerificationState.Started:
        return VerificationPhase.Ready;
      case QrVerificationState.Done:
        return VerificationPhase.Done;
      case QrVerificationState.Cancelled:
        return VerificationPhase.Cancelled;
      default:
        return VerificationPhase.Started;
    }
  }

  async verify(): Promise<void> {
    // Already scanned: the user only has to confirm, so surface the prompt again.
    if (this.#callbacks) this.emit(VerifierEvent.ShowReciprocateQr, this.#callbacks);
    await this.completion.promise;
  }

  async reciprocate(): Promise<void> {
    await this.call('qr.reciprocate', this.flow);
  }

  onChange(state: QrState): void {
    this.state = state;

    if (state.isCancelled) {
      this.markCancelled();
      this.completion.reject(new Error('Verification cancelled'));
      return;
    }

    if (!this.#callbacks && state.hasBeenScanned) {
      this.#callbacks = {
        confirm: () => {
          void this.call('qr.confirm', this.flow);
        },
        cancel: () => {
          this.markCancelled();
          void this.call('qr.cancel', { ...this.flow, code: 'm.user' });
        },
      };
      this.emit(VerifierEvent.ShowReciprocateQr, this.#callbacks);
    }

    if (state.isDone) this.completion.resolve();
  }

  getReciprocateQrCodeCallbacks(): ShowQrCodeCallbacks | null {
    return this.#callbacks;
  }
}

const generatedSas = (state: SasState): GeneratedSas | null => {
  const emoji = state.emoji?.map(({ symbol, description }) => [symbol, description]) as
    | GeneratedSas['emoji']
    | undefined;
  const decimals = state.decimals;
  const decimal =
    decimals && decimals.length >= 3
      ? ([decimals[0], decimals[1], decimals[2]] as [number, number, number])
      : undefined;

  if (!emoji?.length && !decimal) return null;
  return { emoji, decimal };
};
