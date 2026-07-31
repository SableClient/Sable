import type {
  LivekitJsControllerFailure,
  LivekitJsControllerLifecycle,
} from './livekitJsController';
import type { NativeCallLifecycle } from '$state/nativeCall';

/**
 * Coarse lifecycle phase both call engines map to. The engine-specific
 * lifecycle unions genuinely differ: LiveKit JS splits "connecting" into
 * joining-matrix / provisioning / connecting-livekit, and Native adds
 * "reconnecting", so the shared chrome reasons about a coarse phase while each
 * engine keeps its own union and its own user-facing label map.
 */
type CallPhase = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stopping' | 'failed';

/**
 * The contract every call engine satisfies. Both `NativeCallSession` (iOS,
 * LiveKit Swift SDK) and `LivekitJsCallSession` (Web / Desktop Tauri, livekit-js)
 * expose a room id, a lifecycle, and a hangup.
 *
 * Direct media toggles are optional: the native engine exposes them so its
 * surface can render its own mic/camera buttons; the livekit-js engine delegates
 * media controls to `@livekit/components-react`'s `ControlBar`, so it does not.
 * Engine-specific fields (LiveKit's `room` / `e2eeReady` / `initialMedia`,
 * Native's `callId` / `backend` / `error`) stay on the concrete session and are
 * read directly by each surface.
 */
export interface CallClient<TLifecycle extends string = string> {
  readonly roomId: string;
  readonly lifecycle: TLifecycle;
  readonly hangup: () => Promise<void>;
  readonly microphoneEnabled?: boolean;
  readonly cameraEnabled?: boolean;
  readonly setMicrophoneEnabled?: (enabled: boolean) => Promise<void>;
  readonly setCameraEnabled?: (enabled: boolean) => Promise<void>;
}

/**
 * The status slice the shared `CallStatusBar` renders: a coarse phase (drives
 * the End vs Dismiss button), the resolved label line, and optional error
 * detail. Each engine produces one from its own lifecycle + error shape.
 */
export type CallStatusView = {
  phase: CallPhase;
  statusLabel: string;
  error?: string;
};

/**
 * Lifecycle → user-facing label maps. Colocated so the two surfaces share one
 * source of truth for status copy; they remain two maps because the lifecycle
 * unions (and therefore the distinct labels "Preparing call", "Reconnecting",
 * …) genuinely differ.
 */
const livekitJsLifecycleLabels: Record<LivekitJsControllerLifecycle, string> = {
  idle: 'Idle',
  'joining-matrix': 'Joining call',
  provisioning: 'Preparing call',
  'connecting-livekit': 'Connecting',
  active: 'Connected',
  stopping: 'Ending call',
  failed: 'Call failed',
};

const livekitJsFailureMessages: Record<LivekitJsControllerFailure, string> = {
  'e2ee-unsupported': 'Encrypted calls are not supported on this device.',
  'e2ee-import-failed': 'Could not set up call encryption.',
  'setup-failed': 'Could not connect to the call.',
};

export const nativeCallLifecycleLabels: Record<NativeCallLifecycle, string> = {
  starting: 'Starting call',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Call failed',
};

function livekitJsPhase(lifecycle: LivekitJsControllerLifecycle): CallPhase {
  switch (lifecycle) {
    case 'idle':
      return 'idle';
    case 'active':
      return 'connected';
    case 'stopping':
      return 'stopping';
    case 'failed':
      return 'failed';
    default:
      // joining-matrix, provisioning, connecting-livekit are all "connecting".
      return 'connecting';
  }
}

function nativePhase(lifecycle: NativeCallLifecycle): CallPhase {
  switch (lifecycle) {
    case 'connected':
      return 'connected';
    case 'reconnecting':
      return 'reconnecting';
    case 'error':
      return 'failed';
    default:
      // starting, connecting are both "connecting".
      return 'connecting';
  }
}

/**
 * Project a LiveKit JS session into the shared status view. Accepts just the
 * lifecycle + failure slice so the CallView status wrapper (and tests) can feed
 * a partial session.
 */
export function livekitJsCallStatus(session: {
  lifecycle: LivekitJsControllerLifecycle;
  failure: LivekitJsControllerFailure | null;
}): CallStatusView {
  return {
    phase: livekitJsPhase(session.lifecycle),
    statusLabel: livekitJsLifecycleLabels[session.lifecycle],
    error: session.failure ? livekitJsFailureMessages[session.failure] : undefined,
  };
}

/**
 * Project a native call session into the shared status view. Native carries its
 * error as a plain string (the native SDK's failure message), so it is passed
 * through verbatim.
 */
export function nativeCallStatus(session: {
  lifecycle: NativeCallLifecycle;
  error?: string;
}): CallStatusView {
  return {
    phase: nativePhase(session.lifecycle),
    statusLabel: nativeCallLifecycleLabels[session.lifecycle],
    error: session.error,
  };
}
