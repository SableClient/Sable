import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('$utils/platform', () => ({ isDesktopTauri: desktop }));

import { isNativeCallProbeEnabled, NATIVE_CALL_PROBE_STORAGE_KEY } from './nativeCallProbe';

describe('native call probe gate', () => {
  beforeEach(() => {
    desktop.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled by default and enabled only by the documented desktop key', () => {
    desktop.mockReturnValue(true);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'false');
    expect(isNativeCallProbeEnabled()).toBe(false);

    localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');
    expect(isNativeCallProbeEnabled()).toBe(true);
  });

  it('is enabled by the environment flag on desktop Tauri', () => {
    desktop.mockReturnValue(true);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');

    expect(isNativeCallProbeEnabled()).toBe(true);
  });

  it('is disabled outside desktop Tauri', () => {
    desktop.mockReturnValue(false);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');
    localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');
    expect(isNativeCallProbeEnabled()).toBe(false);
  });
});
