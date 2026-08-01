import { BaseKeyProvider, isE2EESupported } from 'livekit-client';
import {
  MatrixRTCSessionEvent,
  type CallMembershipIdentityParts,
  type MatrixRTCSession,
} from '$types/matrix-sdk';
import type { LocalCallIdentity } from './livekitCallIdentity';

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
  | {
      keyMaterial: CryptoKey;
      rtcBackendIdentity: string;
      encryptionKeyIndex: number;
      isLocal: boolean;
    }
  | { failure: LivekitMatrixKeyImportFailure };

export class LivekitMatrixKeyProvider extends BaseKeyProvider {
  private rtcSession?: MatrixRTCSession;
  private localIdentity: LocalCallIdentity | null = null;
  private attachmentGeneration = 0;
  private nextImportSequence = 0;
  private nextUpdateSequence = 0;
  private readonly pendingUpdates = new Map<number, KeyImportResult>();
  private readonly acceptedKeyIndices = new Map<string, number>();
  private readonly stateListeners = new Set<LivekitMatrixKeyProviderStateListener>();
  private localOutboundIdentity: string | null = null;
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

  public attach(session: MatrixRTCSession, localIdentity: LocalCallIdentity): void {
    this.detach();
    this.rtcSession = session;
    this.localIdentity = localIdentity;
    session.on(MatrixRTCSessionEvent.EncryptionKeyChanged, this.onEncryptionKeyChanged);
    session.reemitEncryptionKeys();
  }

  public detach(): void {
    this.attachmentGeneration += 1;
    this.nextImportSequence = 0;
    this.nextUpdateSequence = 0;
    this.pendingUpdates.clear();
    this.acceptedKeyIndices.clear();
    this.localIdentity = null;
    this.localOutboundIdentity = null;
    this.updateState({
      ready: false,
      localOutboundIdentity: null,
      keyIndex: null,
      lastImportFailure: null,
    });

    if (!this.rtcSession) return;

    this.rtcSession.off(MatrixRTCSessionEvent.EncryptionKeyChanged, this.onEncryptionKeyChanged);
    this.rtcSession = undefined;
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

  private readonly onEncryptionKeyChanged = (
    encryptionKey: Uint8Array<ArrayBuffer>,
    encryptionKeyIndex: number,
    membershipParts: CallMembershipIdentityParts,
    rtcBackendIdentity: string
  ): void => {
    const generation = this.attachmentGeneration;
    const sequence = this.nextImportSequence++;
    const isLocal =
      membershipParts.userId === this.localIdentity?.userId &&
      membershipParts.deviceId === this.localIdentity?.deviceId;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof subtle.importKey !== 'function') {
      this.enqueueUpdate(generation, sequence, {
        failure: 'webcrypto-unavailable',
      });
      return;
    }

    let importPromise: Promise<CryptoKey>;
    try {
      importPromise = subtle.importKey('raw', encryptionKey, 'HKDF', false, [
        'deriveBits',
        'deriveKey',
      ]);
    } catch {
      this.enqueueUpdate(generation, sequence, { failure: 'import-failed' });
      return;
    }

    void importPromise.then(
      (keyMaterial) => {
        this.enqueueUpdate(generation, sequence, {
          keyMaterial,
          rtcBackendIdentity,
          encryptionKeyIndex,
          isLocal,
        });
      },
      () => {
        this.enqueueUpdate(generation, sequence, { failure: 'import-failed' });
      }
    );
  };

  private enqueueUpdate(generation: number, sequence: number, result: KeyImportResult): void {
    if (generation !== this.attachmentGeneration) return;
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

      const lastParticipantKeyIndex = this.acceptedKeyIndices.get(update.rtcBackendIdentity) ?? -1;
      if (update.encryptionKeyIndex < lastParticipantKeyIndex) continue;

      try {
        this.onSetEncryptionKey(
          update.keyMaterial,
          update.rtcBackendIdentity,
          update.encryptionKeyIndex
        );
      } catch {
        this.updateState({ lastImportFailure: 'import-failed' });
        continue;
      }

      this.acceptedKeyIndices.set(
        update.rtcBackendIdentity,
        Math.max(
          this.acceptedKeyIndices.get(update.rtcBackendIdentity) ?? -1,
          update.encryptionKeyIndex
        )
      );

      // Only the local key clears the failure flag: a remote participant's key
      // succeeding says nothing about whether our own outbound key imported.
      if (update.isLocal) {
        this.localOutboundIdentity = update.rtcBackendIdentity;
        this.updateState({
          ready: true,
          localOutboundIdentity: update.rtcBackendIdentity,
          keyIndex: update.encryptionKeyIndex,
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
