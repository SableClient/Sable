import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopRuntimeState } from '$generated/tauri/types';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { defaultSettings, settingsAtom } from '$state/settings';
import type * as PlatformUtils from '$utils/platform';
import { KeyboardShortcuts } from './KeyboardShortcuts';

const { mockGetDesktopRuntimeState, mockIsDesktopTauri, mockSetToggleWindowShortcut } =
  vi.hoisted(() => ({
    mockGetDesktopRuntimeState: vi.fn<() => Promise<DesktopRuntimeState>>(),
    mockIsDesktopTauri: vi.fn<() => boolean>(() => true),
    mockSetToggleWindowShortcut: vi
      .fn<(params: { binding: string | null }) => Promise<DesktopRuntimeState>>(),
  }));

vi.mock('$generated/tauri/commands', () => ({
  getDesktopRuntimeState: mockGetDesktopRuntimeState,
  setToggleWindowShortcut: mockSetToggleWindowShortcut,
}));

vi.mock('$utils/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof PlatformUtils>()),
  isDesktopTauri: mockIsDesktopTauri,
}));

const runtimeState = (toggleWindowShortcut: string | null): DesktopRuntimeState => ({
  trayAvailable: false,
  toggleWindowShortcut,
});

const renderPage = () => {
  const store = createStore();
  store.set(settingsAtom, { ...defaultSettings, shortcutOverrides: {} });
  render(
    <Provider store={store}>
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <KeyboardShortcuts requestClose={() => {}} />
      </ScreenSizeProvider>
    </Provider>
  );
  return store;
};

describe('KeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsDesktopTauri.mockReturnValue(true);
    mockGetDesktopRuntimeState.mockResolvedValue(runtimeState(null));
    mockSetToggleWindowShortcut.mockImplementation(({ binding }) =>
      Promise.resolve(runtimeState(binding))
    );
  });

  it('captures and resets a custom binding', () => {
    const store = renderPage();
    const change = screen.getByRole('button', { name: 'Change Bold' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'j', ctrlKey: true });
    expect(store.get(settingsAtom).shortcutOverrides['composer.bold']).toBe('mod+j');

    fireEvent.click(screen.getAllByRole('button', { name: 'Reset' })[0]!);
    expect(store.get(settingsAtom).shortcutOverrides['composer.bold']).toBeUndefined();
  });

  it('reports a binding conflict in an overlapping scope', () => {
    const store = renderPage();
    const change = screen.getByRole('button', { name: 'Change Bold' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'f', ctrlKey: true });

    expect(screen.getByText(/Already used by “Search for messages”/)).toBeInTheDocument();
    expect(store.get(settingsAtom).shortcutOverrides['composer.bold']).toBeUndefined();
  });

  it('renders the toggle-window shortcut in the Global category', async () => {
    mockGetDesktopRuntimeState.mockResolvedValue(runtimeState('mod+shift+s'));
    renderPage();

    expect(await screen.findByText('Show or hide the app window')).toBeInTheDocument();
    expect(screen.getByText('Global')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Shift+S')).toBeInTheDocument();
  });

  it('hides the Global section outside the desktop app', () => {
    mockIsDesktopTauri.mockReturnValue(false);
    renderPage();

    expect(screen.queryByText('Global')).not.toBeInTheDocument();
    expect(screen.queryByText('Show or hide the app window')).not.toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('captures a custom binding for the toggle-window shortcut', async () => {
    const store = renderPage();
    await screen.findByText('Show or hide the app window');

    const change = screen.getByRole('button', { name: 'Change Show or hide the app window' });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 't', ctrlKey: true, shiftKey: true });

    await waitFor(() =>
      expect(mockSetToggleWindowShortcut).toHaveBeenCalledWith({ binding: 'mod+shift+t' })
    );
    expect(await screen.findByText('Ctrl+Shift+T')).toBeInTheDocument();
    expect(store.get(settingsAtom).shortcutOverrides).toEqual({});
  });

  it('reports a conflict when another shortcut matches the toggle-window binding', async () => {
    mockGetDesktopRuntimeState.mockResolvedValue(runtimeState('mod+shift+s'));
    const store = renderPage();
    await screen.findByText('Show or hide the app window');

    const change = screen.getByRole('button', { name: 'Change Bold' });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 's', ctrlKey: true, shiftKey: true });

    expect(
      await screen.findByText(/Already used by “Show or hide the app window”/)
    ).toBeInTheDocument();
    expect(mockSetToggleWindowShortcut).not.toHaveBeenCalled();
    expect(store.get(settingsAtom).shortcutOverrides['composer.bold']).toBeUndefined();
  });

  it('disables the toggle-window shortcut with Backspace', async () => {
    mockGetDesktopRuntimeState.mockResolvedValue(runtimeState('mod+shift+s'));
    renderPage();
    await screen.findByText('Show or hide the app window');

    const change = screen.getByRole('button', { name: 'Change Show or hide the app window' });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'Backspace' });

    await waitFor(() =>
      expect(mockSetToggleWindowShortcut).toHaveBeenCalledWith({ binding: null })
    );
    expect(await screen.findByText('Unassigned')).toBeInTheDocument();
  });

  it('shows an error when registration fails', async () => {
    mockSetToggleWindowShortcut.mockImplementationOnce(() =>
      Promise.reject(new Error('already taken'))
    );
    renderPage();
    await screen.findByText('Show or hide the app window');

    const change = screen.getByRole('button', { name: 'Change Show or hide the app window' });
    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 't', ctrlKey: true, shiftKey: true });

    expect(await screen.findByText(/Could not register this shortcut/)).toBeInTheDocument();
  });
});
