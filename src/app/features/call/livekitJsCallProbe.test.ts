import { describe, expect, it } from 'vitest';

import { isLivekitJsCallProbeEnabled } from './livekitJsCallProbe';

describe('isLivekitJsCallProbeEnabled', () => {
  it('defaults off and requires explicit enablement', () => {
    expect(isLivekitJsCallProbeEnabled()).toBe(false);
    expect(isLivekitJsCallProbeEnabled(false)).toBe(false);
    expect(isLivekitJsCallProbeEnabled(true)).toBe(true);
  });

  it('enables on plain browser builds when the setting is on', () => {
    // No Tauri runtime mocks: jsdom is a plain browser environment.
    expect(isLivekitJsCallProbeEnabled(true)).toBe(true);
  });
});
