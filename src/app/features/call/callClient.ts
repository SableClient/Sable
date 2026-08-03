import type {
  LivekitJsControllerFailure,
  LivekitJsControllerLifecycle,
} from '@sableclient/matrixrtc';
import type { NativeCallLifecycle } from '$state/nativeCall';

type CallPhase = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stopping' | 'failed';

export type CallStatusView = {
  phase: CallPhase;
  statusLabel: string;
  error?: string;
};

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
