import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getNativeCallAvailability,
  NATIVE_CALL_PROBE_STORAGE_KEY,
  resetNativeCallAvailabilityForTests,
} from './nativeCallProbe';
import { isMobileTauri } from '$utils/platform';
import { getNativeCallCapabilities, type NativeCallCapabilities } from './livekitMobileBridge';

vi.mock('$utils/platform', () => ({
  isMobileTauri: vi.fn<() => boolean>(),
}));

vi.mock('./livekitMobileBridge', () => ({
  getNativeCallCapabilities: vi.fn<() => Promise<NativeCallCapabilities>>(),
}));

const allCapabilities = {
  supported: true,
  microphone: true,
  backgroundAudio: true,
  nativeRoom: true,
  camera: true,
  nativeVideoOverlay: false,
};

beforeEach(() => {
  resetNativeCallAvailabilityForTests();
  window.localStorage.clear();
  vi.mocked(isMobileTauri).mockReturnValue(false);
  vi.mocked(getNativeCallCapabilities).mockResolvedValue(allCapabilities);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getNativeCallAvailability', () => {
  it('is unavailable outside Tauri mobile even with the probe flag set', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(false);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');

    await expect(getNativeCallAvailability()).resolves.toBe(false);
    expect(getNativeCallCapabilities).not.toHaveBeenCalled();
  });

  it('is unavailable without the probe flag on Tauri mobile', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);

    await expect(getNativeCallAvailability()).resolves.toBe(false);
    expect(getNativeCallCapabilities).not.toHaveBeenCalled();
  });

  it('is available on Tauri mobile with the probe flag and supporting capabilities', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    window.localStorage.setItem(NATIVE_CALL_PROBE_STORAGE_KEY, '1');

    await expect(getNativeCallAvailability()).resolves.toBe(true);
  });

  it('is unavailable when the native plugin does not support calls', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');
    vi.mocked(getNativeCallCapabilities).mockResolvedValue({
      ...allCapabilities,
      supported: false,
    });

    await expect(getNativeCallAvailability()).resolves.toBe(false);
  });

  it('is unavailable when the capabilities request fails', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    vi.stubEnv('VITE_ENABLE_NATIVE_CALL_PROBE', 'true');
    vi.mocked(getNativeCallCapabilities).mockRejectedValue(new Error('plugin missing'));

    await expect(getNativeCallAvailability()).resolves.toBe(false);
  });
});
