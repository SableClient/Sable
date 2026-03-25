import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriFrontendReady } from './TauriFrontendReady';

const {
  mockIsTauri,
  mockOsType,
  mockShow,
  mockGetCurrentWindow,
  mockSetCloseToTrayEnabled,
  mockUseSetting,
} = vi.hoisted(() => {
  const show = vi.fn().mockResolvedValue(undefined);

  return {
    mockIsTauri: vi.fn(),
    mockOsType: vi.fn(),
    mockShow: show,
    mockGetCurrentWindow: vi.fn(() => ({ show })),
    mockSetCloseToTrayEnabled: vi.fn().mockResolvedValue(undefined),
    mockUseSetting: vi.fn(() => [true, vi.fn()]),
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mockIsTauri,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: mockOsType,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: mockGetCurrentWindow,
}));

vi.mock('$generated/tauri/commands', () => ({
  setCloseToTrayEnabled: mockSetCloseToTrayEnabled,
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: mockUseSetting,
}));

vi.mock('$state/settings', () => ({
  settingsAtom: {},
}));

vi.mock('$utils/debug', () => ({
  createLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('TauriFrontendReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(true);
    mockUseSetting.mockReturnValue([true, vi.fn()]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not schedule mobile startup work after mount', async () => {
    const requestAnimationFrameSpy = vi.fn(() => 1);
    const cancelAnimationFrameSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);
    mockOsType.mockReturnValue('android');

    render(<TauriFrontendReady />);

    await waitFor(() => {
      expect(mockOsType).toHaveBeenCalledTimes(2);
    });

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled();
    expect(mockGetCurrentWindow).not.toHaveBeenCalled();
    expect(mockSetCloseToTrayEnabled).not.toHaveBeenCalled();
  });

  it('shows the desktop window and syncs close-to-tray on desktop', async () => {
    const requestAnimationFrameSpy = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    mockOsType.mockReturnValue('windows');

    render(<TauriFrontendReady />);

    await waitFor(() => {
      expect(mockShow).toHaveBeenCalledOnce();
    });

    expect(mockGetCurrentWindow).toHaveBeenCalledOnce();
    expect(mockSetCloseToTrayEnabled).toHaveBeenCalledWith({ enabled: true });
  });
});
