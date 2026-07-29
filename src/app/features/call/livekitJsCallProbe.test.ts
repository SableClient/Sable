import { beforeEach, describe, expect, it, vi } from 'vitest';

const desktopTauri = vi.hoisted(() => vi.fn<() => boolean>());
const mobileTauri = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock('$utils/platform', () => ({ isDesktopTauri: desktopTauri, isMobileTauri: mobileTauri }));

import { isCallProbePlatformSupported, isLivekitJsCallProbeEnabled } from './livekitJsCallProbe';

beforeEach(() => {
  desktopTauri.mockReset();
  mobileTauri.mockReset();
});

describe('isLivekitJsCallProbeEnabled', () => {
  it('requires the persisted setting on desktop Tauri', () => {
    desktopTauri.mockReturnValue(true);
    mobileTauri.mockReturnValue(false);
    expect(isLivekitJsCallProbeEnabled(false)).toBe(false);
    expect(isLivekitJsCallProbeEnabled(true)).toBe(true);
  });

  it('activates the persisted setting on mobile Tauri', () => {
    desktopTauri.mockReturnValue(false);
    mobileTauri.mockReturnValue(true);
    expect(isLivekitJsCallProbeEnabled(true)).toBe(true);
  });

  it('stays disabled on web even when the setting is on', () => {
    desktopTauri.mockReturnValue(false);
    mobileTauri.mockReturnValue(false);
    expect(isLivekitJsCallProbeEnabled(true)).toBe(false);
  });
});

describe('isCallProbePlatformSupported', () => {
  it('is supported on desktop or mobile Tauri only', () => {
    desktopTauri.mockReturnValue(true);
    mobileTauri.mockReturnValue(false);
    expect(isCallProbePlatformSupported()).toBe(true);

    desktopTauri.mockReturnValue(false);
    mobileTauri.mockReturnValue(true);
    expect(isCallProbePlatformSupported()).toBe(true);

    desktopTauri.mockReturnValue(false);
    mobileTauri.mockReturnValue(false);
    expect(isCallProbePlatformSupported()).toBe(false);
  });
});
