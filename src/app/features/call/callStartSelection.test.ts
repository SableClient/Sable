import { describe, expect, it } from 'vitest';
import { selectCallStartOwner } from './callStartSelection';

describe('selectCallStartOwner', () => {
  it('selects the native transport when available, even over LiveKit JS', () => {
    expect(selectCallStartOwner({ newCallsEnabled: true, nativeCallAvailable: true })).toBe(
      'livekit-mobile'
    );
  });

  it('retains LiveKit JS when the native transport is unavailable', () => {
    expect(selectCallStartOwner({ newCallsEnabled: true, nativeCallAvailable: false })).toBe(
      'livekit-js'
    );
  });

  it('selects LiveKit JS when new calls are enabled', () => {
    expect(selectCallStartOwner({ newCallsEnabled: true })).toBe('livekit-js');
  });

  it('falls back to Element Call when new calls are disabled', () => {
    expect(selectCallStartOwner({ newCallsEnabled: false })).toBe('element');
  });

  it('keeps the Element fallback when new calls are disabled, even if native is available', () => {
    expect(selectCallStartOwner({ newCallsEnabled: false, nativeCallAvailable: true })).toBe(
      'element'
    );
  });
});
