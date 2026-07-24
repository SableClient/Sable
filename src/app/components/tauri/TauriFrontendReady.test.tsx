import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriFrontendReady } from './TauriFrontendReady';

const { mockIsTauri, mockOsType, mockShow, mockGetCurrentWindow } = vi.hoisted(() => ({
  mockIsTauri: vi.fn<() => boolean>(),
  mockOsType: vi.fn<() => string>(),
  mockShow: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockGetCurrentWindow: vi.fn<() => { show: () => Promise<void> }>(),
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
    log: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
  }),
}));

function setDocumentReadyState(value: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value,
  });
}

function setDocumentVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
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
    setDocumentVisibility('visible');
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

  it('falls back to the load event when the document is hidden and still loading', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    mockOsType.mockReturnValue('linux');
    setDocumentVisibility('hidden');
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
