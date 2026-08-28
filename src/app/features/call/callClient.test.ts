import { describe, expect, it } from 'vitest';
import type { LivekitJsControllerLifecycle } from '@sableclient/matrixrtc';
import type { NativeCallLifecycle } from '$state/nativeCall';
import { livekitJsCallStatus, nativeCallStatus } from './callClient';

describe('livekitJsCallStatus', () => {
  it.each([
    ['idle', 'idle'],
    ['joining-matrix', 'connecting'],
    ['provisioning', 'connecting'],
    ['connecting-livekit', 'connecting'],
    ['active', 'connected'],
    ['stopping', 'stopping'],
    ['failed', 'failed'],
  ] as [LivekitJsControllerLifecycle, string][])('maps %s to the %s phase', (lifecycle, phase) => {
    expect(livekitJsCallStatus({ lifecycle, failure: null }).phase).toBe(phase);
  });

  it('labels every lifecycle', () => {
    expect(livekitJsCallStatus({ lifecycle: 'provisioning', failure: null }).statusLabel).toBe(
      'Preparing call'
    );
  });

  it('translates a failure into user-facing copy', () => {
    expect(livekitJsCallStatus({ lifecycle: 'failed', failure: 'e2ee-unsupported' }).error).toBe(
      'Encrypted calls are not supported on this device.'
    );
    expect(livekitJsCallStatus({ lifecycle: 'active', failure: null }).error).toBeUndefined();
  });
});

describe('nativeCallStatus', () => {
  it.each([
    ['starting', 'connecting'],
    ['connecting', 'connecting'],
    ['connected', 'connected'],
    ['reconnecting', 'reconnecting'],
    ['error', 'failed'],
  ] as [NativeCallLifecycle, string][])('maps %s to the %s phase', (lifecycle, phase) => {
    expect(nativeCallStatus({ lifecycle }).phase).toBe(phase);
  });

  it('agrees with the JS engine on what "connected" means', () => {
    expect(nativeCallStatus({ lifecycle: 'connected' }).phase).toBe(
      livekitJsCallStatus({ lifecycle: 'active', failure: null }).phase
    );
  });

  it('passes the transport error through', () => {
    expect(nativeCallStatus({ lifecycle: 'error', error: 'boom' }).error).toBe('boom');
  });
});
