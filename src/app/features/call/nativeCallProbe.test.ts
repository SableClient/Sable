import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const desktopTauri = vi.hoisted(() => vi.fn<() => boolean>());
const mobileTauri = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('$utils/platform', () => ({
  isDesktopTauri: desktopTauri,
  isMobileTauri: mobileTauri,
}));

import {
  isNativeCallProbeEnabled,
  isNativeCallProbePlatformSupported,
  NATIVE_CALL_PROBE_STORAGE_KEY,
} from './nativeCallProbe';

describe('native call probe gate', () => {
  beforeEach(() => {
    desktopTauri.mockReset();
    mobileTauri.mockReset();
    desktopTauri.mockReturnValue(false);
    mobileTauri.mockReturnValue(false);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled by default and enabled by the persisted setting', () => {
    desktopTauri.mockReturnValue(true);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'false');
    expect(isNativeCallProbeEnabled()).toBe(false);

    expect(isNativeCallProbeEnabled(true)).toBe(true);

    localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');
    expect(isNativeCallProbeEnabled()).toBe(true);
  });

  it('is enabled by the environment flag on desktop Tauri', () => {
    desktopTauri.mockReturnValue(true);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');

    expect(isNativeCallProbeEnabled()).toBe(true);
  });

  it('is disabled outside supported Tauri platforms, including web', () => {
    desktopTauri.mockReturnValue(false);
    mobileTauri.mockReturnValue(false);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');
    localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');
    expect(isNativeCallProbeEnabled()).toBe(false);
  });

  it('supports every native Tauri form factor', () => {
    desktopTauri.mockReturnValue(true);

    expect(isNativeCallProbePlatformSupported()).toBe(true);
    expect(isNativeCallProbeEnabled(true)).toBe(true);

    desktopTauri.mockReturnValue(false);
    mobileTauri.mockReturnValue(true);
    expect(isNativeCallProbePlatformSupported()).toBe(true);
    expect(isNativeCallProbeEnabled(true)).toBe(true);
  });

  it('keeps developer overrides ahead of the persisted setting', () => {
    desktopTauri.mockReturnValue(true);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');

    expect(isNativeCallProbeEnabled()).toBe(true);
  });
});
