import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriFrontendReady } from './TauriFrontendReady';

const { mockIsTauri, mockOsType, mockShow, mockGetCurrentWindow } = vi.hoisted(() => ({
  mockIsTauri: vi.fn(),
  mockOsType: vi.fn(),
  mockShow: vi.fn().mockResolvedValue(undefined),
  mockGetCurrentWindow: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mockIsTauri,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: mockOsType,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: mockGetCurrentWindow,
}));

vi.mock('$utils/debug', () => ({
  createLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

function setDocumentReadyState(value: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value,
  });
}

describe('TauriFrontendReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(true);
    mockGetCurrentWindow.mockReturnValue({ show: mockShow });
    setDocumentReadyState('complete');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not schedule mobile startup work after mount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    mockOsType.mockReturnValue('android');

    render(<TauriFrontendReady />);

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('load', expect.any(Function), {
      once: true,
    });
    expect(mockGetCurrentWindow).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('shows the desktop window without syncing desktop preferences on desktop', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    mockOsType.mockReturnValue('windows');
    setDocumentReadyState('complete');

    render(<TauriFrontendReady />);

    await waitFor(() => {
      expect(mockShow).toHaveBeenCalledOnce();
    });

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('load', expect.any(Function), {
      once: true,
    });
    expect(mockGetCurrentWindow).toHaveBeenCalledOnce();
  });

  it('waits for the window load event before showing the desktop window', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    mockOsType.mockReturnValue('linux');
    setDocumentReadyState('loading');

    render(<TauriFrontendReady />);

    expect(addEventListenerSpy).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
    expect(mockGetCurrentWindow).toHaveBeenCalledOnce();
    expect(mockShow).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(mockShow).toHaveBeenCalledOnce();
    });
  });
});
