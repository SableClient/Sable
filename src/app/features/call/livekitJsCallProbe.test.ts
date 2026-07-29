import { beforeEach, describe, expect, it, vi } from 'vitest';

const desktopTauri = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('$utils/platform', () => ({ isDesktopTauri: desktopTauri }));

import { isLivekitJsCallProbeEnabled } from './livekitJsCallProbe';

beforeEach(() => desktopTauri.mockReset());

describe('isLivekitJsCallProbeEnabled', () => {
  it('requires both the persisted setting and supported desktop Tauri runtime', () => {
    desktopTauri.mockReturnValue(true);
    expect(isLivekitJsCallProbeEnabled(false)).toBe(false);
    expect(isLivekitJsCallProbeEnabled(true)).toBe(true);

    desktopTauri.mockReturnValue(false);
    expect(isLivekitJsCallProbeEnabled(true)).toBe(false);
  });
});
