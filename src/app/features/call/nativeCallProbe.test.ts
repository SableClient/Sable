import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNativeCallAvailability, resetNativeCallAvailabilityForTests } from './nativeCallProbe';
import { isMobileTauri } from '$utils/platform';
import { getNativeCallCapabilities, type NativeCallCapabilities } from './livekitMobileBridge';

vi.mock('$utils/platform', () => ({
  isMobileTauri: vi.fn<() => boolean>(),
}));

vi.mock('./livekitMobileBridge', () => ({
  getNativeCallCapabilities: vi.fn<() => Promise<NativeCallCapabilities>>(),
}));

const allCapabilities: NativeCallCapabilities = {
  supported: true,
  microphone: true,
  backgroundAudio: true,
  nativeRoom: true,
  camera: true,
  nativeVideoOverlay: false,
  callKit: true,
};

beforeEach(() => {
  resetNativeCallAvailabilityForTests();
  vi.mocked(isMobileTauri).mockReturnValue(false);
  vi.mocked(getNativeCallCapabilities).mockResolvedValue(allCapabilities);
});

describe('getNativeCallAvailability', () => {
  it('is unavailable outside Tauri mobile even with new calls enabled', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(false);

    await expect(getNativeCallAvailability(true)).resolves.toBe(false);
    expect(getNativeCallCapabilities).not.toHaveBeenCalled();
  });

  it('is unavailable with new calls disabled on Tauri mobile', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);

    await expect(getNativeCallAvailability(false)).resolves.toBe(false);
    expect(getNativeCallCapabilities).not.toHaveBeenCalled();
  });

  it('is available on Tauri mobile with new calls enabled and supporting capabilities', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);

    await expect(getNativeCallAvailability(true)).resolves.toBe(true);
  });

  it('is unavailable when the native plugin does not support calls', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    vi.mocked(getNativeCallCapabilities).mockResolvedValue({
      ...allCapabilities,
      supported: false,
    });

    await expect(getNativeCallAvailability(true)).resolves.toBe(false);
  });

  it('is unavailable when the capabilities request fails', async () => {
    vi.mocked(isMobileTauri).mockReturnValue(true);
    vi.mocked(getNativeCallCapabilities).mockRejectedValue(new Error('plugin missing'));

    await expect(getNativeCallAvailability(true)).resolves.toBe(false);
  });
});
