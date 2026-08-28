import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNativeCallAvailability, resetNativeCallAvailabilityForTests } from './nativeCallProbe';
import { isMobileTauri } from '$utils/platform';
import {
  getNativeCallCapabilities,
  type NativeCallCapabilities,
} from '@sableclient/tauri-plugin-livekit-mobile';

vi.mock('$utils/platform', () => ({
  isMobileTauri: vi.fn<() => boolean>(),
}));

vi.mock('@sableclient/tauri-plugin-livekit-mobile', () => ({
  getNativeCallCapabilities: vi.fn<() => Promise<NativeCallCapabilities>>(),
}));

const allCapabilities: NativeCallCapabilities = {
  supported: true,
  microphone: true,
  backgroundAudio: true,
  nativeRoom: true,
  camera: true,
  nativeVideoOverlay: false,
  screenShare: false,
  pictureInPicture: false,
  callKit: true,
  systemCalls: false,
  audioRoutes: false,
  pushKit: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetNativeCallAvailabilityForTests();
  vi.mocked(isMobileTauri).mockReturnValue(false);
  vi.mocked(getNativeCallCapabilities).mockResolvedValue(allCapabilities);
});

describe('getNativeCallAvailability', () => {
  it('is unavailable outside Tauri mobile', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(false);

    await expect(getNativeCallAvailability()).resolves.toBe(false);
    expect(getNativeCallCapabilities).not.toHaveBeenCalled();
  });

  it('is available on Tauri mobile with supporting capabilities', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);

    await expect(getNativeCallAvailability()).resolves.toBe(true);
  });

  it('is unavailable when the native plugin does not support calls', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    vi.mocked(getNativeCallCapabilities).mockResolvedValue({
      ...allCapabilities,
      supported: false,
    });

    await expect(getNativeCallAvailability()).resolves.toBe(false);
  });

  it('is unavailable when the capabilities request fails', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    vi.mocked(getNativeCallCapabilities).mockRejectedValue(new Error('plugin missing'));

    await expect(getNativeCallAvailability()).resolves.toBe(false);
  });

  it('caches a supported verdict instead of re-probing the plugin', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);

    await expect(getNativeCallAvailability()).resolves.toBe(true);
    await expect(getNativeCallAvailability()).resolves.toBe(true);
    expect(getNativeCallCapabilities).toHaveBeenCalledTimes(1);
  });

  it('re-probes after a refused microphone so a later grant is picked up', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    vi.mocked(getNativeCallCapabilities).mockResolvedValueOnce({
      ...allCapabilities,
      microphone: false,
    });

    await expect(getNativeCallAvailability()).resolves.toBe(false);
    await expect(getNativeCallAvailability()).resolves.toBe(true);
    expect(getNativeCallCapabilities).toHaveBeenCalledTimes(2);
  });

  it('re-probes after a failed capabilities request', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    vi.mocked(getNativeCallCapabilities).mockRejectedValueOnce(new Error('plugin missing'));

    await expect(getNativeCallAvailability()).resolves.toBe(false);
    await expect(getNativeCallAvailability()).resolves.toBe(true);
    expect(getNativeCallCapabilities).toHaveBeenCalledTimes(2);
  });
});
