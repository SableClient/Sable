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
} = vi.hoisted(() => ({
  mockIsTauri: vi.fn(),
  mockOsType: vi.fn(),
  mockShow: vi.fn().mockResolvedValue(undefined),
  mockGetCurrentWindow: vi.fn(),
  mockSetCloseToTrayEnabled: vi.fn().mockResolvedValue(undefined),
  mockUseSetting: vi.fn(() => [true, vi.fn()]),
}));

function setDocumentReadyState(value: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value,
  });
}

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
    mockGetCurrentWindow.mockReturnValue({ show: mockShow });
    mockUseSetting.mockReturnValue([true, vi.fn()]);
    setDocumentReadyState('complete');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not schedule mobile startup work after mount', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    mockOsType.mockReturnValue('android');

    render(<TauriFrontendReady />);

    await waitFor(() => {
      expect(mockOsType).toHaveBeenCalledTimes(2);
    });

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('load', expect.any(Function), {
      once: true,
    });
    expect(mockGetCurrentWindow).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
    expect(mockSetCloseToTrayEnabled).not.toHaveBeenCalled();
  });

  it('shows the desktop window immediately when the page is already fully loaded', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    mockOsType.mockReturnValue('windows');
    setDocumentReadyState('complete');

    render(<TauriFrontendReady />);

    await waitFor(() => {
      expect(mockShow).toHaveBeenCalledOnce();
      expect(mockSetCloseToTrayEnabled).toHaveBeenCalledWith({ enabled: true });
    });

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('load', expect.any(Function), {
      once: true,
    });
    expect(mockGetCurrentWindow).toHaveBeenCalledOnce();
  });

  it('waits for the window load event before showing the desktop window', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    mockOsType.mockReturnValue('windows');
    setDocumentReadyState('loading');

    render(<TauriFrontendReady />);

    await waitFor(() => {
      expect(mockSetCloseToTrayEnabled).toHaveBeenCalledWith({ enabled: true });
    });

    expect(addEventListenerSpy).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
    expect(mockGetCurrentWindow).toHaveBeenCalledOnce();
    expect(mockShow).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(mockShow).toHaveBeenCalledOnce();
    });

    expect(mockSetCloseToTrayEnabled).toHaveBeenCalledWith({ enabled: true });
  });
});
