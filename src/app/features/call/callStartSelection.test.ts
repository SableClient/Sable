import { describe, expect, it } from 'vitest';
import { selectCallStartOwner } from './callStartSelection';

describe('selectCallStartOwner', () => {
  it('selects the LiveKit JS probe when enabled', () => {
    expect(selectCallStartOwner({ livekitJsProbeEnabled: true })).toBe('livekit-js');
  });

  it('falls back to Element Call when the probe is disabled', () => {
    expect(selectCallStartOwner({ livekitJsProbeEnabled: false })).toBe('element');
  });
});
