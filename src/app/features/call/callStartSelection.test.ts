import { describe, expect, it } from 'vitest';
import { selectCallStartOwner } from './callStartSelection';

describe('selectCallStartOwner', () => {
  it('prioritizes the enabled supported LiveKit JS probe', () => {
    expect(selectCallStartOwner({ livekitJsProbeEnabled: true, nativeProbeEnabled: true })).toBe(
      'livekit-js'
    );
  });

  it('preserves native then Element Call fallback priority', () => {
    expect(selectCallStartOwner({ livekitJsProbeEnabled: false, nativeProbeEnabled: true })).toBe(
      'native'
    );
    expect(selectCallStartOwner({ livekitJsProbeEnabled: false, nativeProbeEnabled: false })).toBe(
      'element'
    );
  });
});
