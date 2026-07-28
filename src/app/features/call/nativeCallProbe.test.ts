import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => vi.fn<() => string | undefined>());

vi.mock('$utils/platform', () => ({ getDesktopTauriPlatform: platform }));

import { isNativeCallProbeEnabled, NATIVE_CALL_PROBE_STORAGE_KEY } from './nativeCallProbe';

describe('native call probe gate', () => {
  beforeEach(() => {
    platform.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled by default and enabled only by the documented desktop key', () => {
    platform.mockReturnValue('linux');
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'false');
    expect(isNativeCallProbeEnabled()).toBe(false);

    localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');
    expect(isNativeCallProbeEnabled()).toBe(true);
  });

  it('is enabled by the environment flag on desktop Tauri', () => {
    platform.mockReturnValue('linux');
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');

    expect(isNativeCallProbeEnabled()).toBe(true);
  });

  it('is disabled outside Linux desktop Tauri', () => {
    platform.mockReturnValue('windows');
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');
    localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');
    expect(isNativeCallProbeEnabled()).toBe(false);
  });

  it('is disabled on macOS desktop Tauri', () => {
    platform.mockReturnValue('macos');
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');
    localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');

    expect(isNativeCallProbeEnabled()).toBe(false);
  });
});
