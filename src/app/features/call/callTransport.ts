/**
 * The seam between the shared call lifecycle and the media stack that carries
 * it: an in-page `livekit-client` Room on the web, a native LiveKit SDK behind
 * IPC on mobile. Everything above this type is written once.
 */

export type CallEncryptionKey = {
  /**
   * The identity the SFU knows, which is the one the JWT granted. It is only
   * ever read off `EncryptionKeyChanged`: the shape depends on the membership
   * format the SFU was told to expect, so it cannot be derived locally.
   */
  identity: string;
  /**
   * A slot in LiveKit's per-participant key ring, not a sequence number. The
   * sender writes it into every frame, slots are reused modulo 256, and a peer
   * that rejoins restarts at 0. Carry it through untouched: filtering on it
   * strands every frame encrypted with the key that was dropped.
   */
  keyIndex: number;
  /** Raw material, as `EncryptionKeyChanged` gives it. Transports encode. */
  key: Uint8Array<ArrayBuffer>;
};

export type CallTrack = {
  id: string;
  muted: boolean;
  subscribed: boolean;
};

export type CallConnectionQuality = 'lost' | 'poor' | 'good' | 'excellent' | 'unknown';

export type CallParticipant = {
  identity: string;
  camera?: CallTrack;
  screenShare?: CallTrack;
  connectionQuality?: CallConnectionQuality;
};

export type CallTransportConnection = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type CallTransportState = {
  connection: CallTransportConnection;
  /** Remote peers only; the local participant is never listed. */
  participants: CallParticipant[];
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  /** User-facing copy, set only when the media stack failed. */
  error?: string;
};

export type CallTransportConnectOptions = {
  url: string;
  token: string;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  /** Keys known at connect time; `setEncryptionKey` keeps feeding the rest. */
  encryptionKeys: CallEncryptionKey[];
};

/** `name` is display-ready; `type` is the bounded platform vocabulary. */
export type CallAudioRoute = {
  id: string;
  name: string;
  type: string;
  current: boolean;
};

/**
 * Extras only one platform has. Feature-detecting these keeps `CallTransport`
 * free of methods half the implementations would have to throw on, and keeps
 * the CallKit/Telecom surface out of the web path.
 */
export type CallTransportCapabilities = {
  camera?: { switch: () => Promise<void> };
  audioRoutes?: {
    list: () => Promise<CallAudioRoute[]>;
    select: (routeId: string) => Promise<void>;
  };
  pictureInPicture?: { setEnabled: (enabled: boolean) => Promise<void> };
};

export type CallTransport = {
  connect: (options: CallTransportConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;

  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  /** Keys arriving before `connect` resolves are queued, never dropped. */
  setEncryptionKey: (key: CallEncryptionKey) => Promise<void>;

  subscribe: (listener: (state: CallTransportState) => void) => () => void;
  getState: () => CallTransportState;
  capabilities: CallTransportCapabilities;
};
