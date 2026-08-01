import { BaseKeyProvider, isE2EESupported } from 'livekit-client';
import type { CallEncryptionKey } from './callTransport';

export const isLivekitE2EESupported = (): boolean => {
  const subtle = globalThis.crypto?.subtle;
  return typeof subtle?.importKey === 'function' && isE2EESupported();
};

export type LivekitMatrixKeyImportFailure = 'webcrypto-unavailable' | 'import-failed';

export type LivekitMatrixKeyProviderState = {
  ready: boolean;
  localOutboundIdentity: string | null;
  keyIndex: number | null;
  lastImportFailure: LivekitMatrixKeyImportFailure | null;
};

export type LivekitMatrixKeyProviderStateListener = (
  state: Readonly<LivekitMatrixKeyProviderState>
) => void;

type KeyImportResult =
  | { keyMaterial: CryptoKey; key: CallEncryptionKey; own: boolean }
  | { failure: LivekitMatrixKeyImportFailure };

/**
 * Turns the keys `callKeyPipeline` reports into LiveKit key-ring entries. It
 * takes no part in the Matrix session: the pipeline is the only subscriber to
 * `EncryptionKeyChanged`, so there is one place where a key can be lost.
 */
export class LivekitMatrixKeyProvider extends BaseKeyProvider {
  private generation = 0;
  private nextImportSequence = 0;
  private nextUpdateSequence = 0;
  private readonly pendingUpdates = new Map<number, KeyImportResult>();
  private readonly stateListeners = new Set<LivekitMatrixKeyProviderStateListener>();
  private state: LivekitMatrixKeyProviderState = {
    ready: false,
    localOutboundIdentity: null,
    keyIndex: null,
    lastImportFailure: null,
  };

  public constructor() {
    super({
      ratchetWindowSize: 10,
      keyringSize: 256,
      sharedKey: false,
    });
  }

  /** Drops everything still importing so a new call starts from a clean ring. */
  public reset(): void {
    this.generation += 1;
    this.nextImportSequence = 0;
    this.nextUpdateSequence = 0;
    this.pendingUpdates.clear();
    this.updateState({
      ready: false,
      localOutboundIdentity: null,
      keyIndex: null,
      lastImportFailure: null,
    });
  }

  public getKeyState(): Readonly<LivekitMatrixKeyProviderState> {
    return { ...this.state };
  }

  public subscribe(listener: LivekitMatrixKeyProviderStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getKeyState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Sequenced on entry so keys reach the ring in the order the session emitted
   * them however long each WebCrypto import takes.
   */
  public readonly setKey = (key: CallEncryptionKey, own: boolean): void => {
    const generation = this.generation;
    const sequence = this.nextImportSequence++;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof subtle.importKey !== 'function') {
      this.enqueueUpdate(generation, sequence, { failure: 'webcrypto-unavailable' });
      return;
    }

    let importPromise: Promise<CryptoKey>;
    try {
      importPromise = subtle.importKey('raw', key.key, 'HKDF', false, ['deriveBits', 'deriveKey']);
    } catch {
      this.enqueueUpdate(generation, sequence, { failure: 'import-failed' });
      return;
    }

    void importPromise.then(
      (keyMaterial) => {
        this.enqueueUpdate(generation, sequence, { keyMaterial, key, own });
      },
      () => {
        this.enqueueUpdate(generation, sequence, { failure: 'import-failed' });
      }
    );
  };

  private enqueueUpdate(generation: number, sequence: number, result: KeyImportResult): void {
    if (generation !== this.generation) return;
    this.pendingUpdates.set(sequence, result);

    while (this.pendingUpdates.has(this.nextUpdateSequence)) {
      const update = this.pendingUpdates.get(this.nextUpdateSequence);
      this.pendingUpdates.delete(this.nextUpdateSequence);
      this.nextUpdateSequence += 1;
      if (!update) continue;

      if ('failure' in update) {
        this.updateState({ lastImportFailure: update.failure });
        continue;
      }

      // Updates are applied in the order the session emitted them, so the most
      // recent key always wins. Skipping lower indices would be wrong: a peer
      // that rejoins starts a fresh outbound session back at index 0, and
      // treating that as stale leaves its media undecryptable for the call.
      try {
        this.onSetEncryptionKey(update.keyMaterial, update.key.identity, update.key.keyIndex);
      } catch {
        this.updateState({ lastImportFailure: 'import-failed' });
        continue;
      }

      // Only the local key clears the failure flag: a remote participant's key
      // succeeding says nothing about whether our own outbound key imported.
      if (update.own) {
        this.updateState({
          ready: true,
          localOutboundIdentity: update.key.identity,
          keyIndex: update.key.keyIndex,
          lastImportFailure: null,
        });
      }
    }
  }

  private updateState(changes: Partial<LivekitMatrixKeyProviderState>): void {
    this.state = { ...this.state, ...changes };
    const state = this.getKeyState();
    this.stateListeners.forEach((listener) => {
      try {
        listener(state);
      } catch {
        // A state observer must not interrupt key updates.
      }
    });
  }
}
