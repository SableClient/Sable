import { describe, expect, it } from 'vitest';
import { selectCallStartOwner } from './callStartSelection';

describe('selectCallStartOwner', () => {
  it('selects the native transport when available, even with the LiveKit JS probe enabled', () => {
    expect(selectCallStartOwner({ livekitJsProbeEnabled: true, nativeCallAvailable: true })).toBe(
      'livekit-mobile'
    );
  });

  it('retains LiveKit JS when the native transport is unavailable', () => {
    expect(selectCallStartOwner({ livekitJsProbeEnabled: true, nativeCallAvailable: false })).toBe(
      'livekit-js'
    );
  });

  it('selects the LiveKit JS probe when enabled', () => {
    expect(selectCallStartOwner({ livekitJsProbeEnabled: true })).toBe('livekit-js');
  });

  it('falls back to Element Call when the probe is disabled and native is unavailable', () => {
    expect(selectCallStartOwner({ livekitJsProbeEnabled: false })).toBe('element');
  });
});
