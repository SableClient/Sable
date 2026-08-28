import { fireEvent, render, screen } from '@testing-library/react';
import { SequenceCardStyle } from '$components/sequence-card';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line no-restricted-imports
import type * as Folds from 'folds';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { Desktop } from './Desktop';

const {
  mockUseDesktopSetting,
  mockUseDesktopSettingsReady,
  mockUseDesktopRuntimeState,
  mockUseDesktopSettingsSyncing,
  mockSetUseCustomTitleBar,
  mockSetSpellcheck,
} = vi.hoisted(() => {
  const setUseCustomTitleBarMock = vi.fn<(value: boolean) => void>();
  const setSpellcheckMock = vi.fn<(value: boolean) => void>();

  return {
    mockUseDesktopSetting: vi.fn<
      (
        key: 'closeToBackgroundOnClose' | 'showSystemTrayIcon' | 'useCustomTitleBar' | 'spellcheck'
      ) => readonly [boolean, (value: boolean) => void]
    >((key) => {
      if (key === 'useCustomTitleBar') return [true, setUseCustomTitleBarMock] as const;
      if (key === 'spellcheck') return [true, setSpellcheckMock] as const;
      if (key === 'closeToBackgroundOnClose') return [true, vi.fn<() => void>()] as const;
      return [true, vi.fn<() => void>()] as const;
    }),
    mockSetUseCustomTitleBar: setUseCustomTitleBarMock,
    mockSetSpellcheck: setSpellcheckMock,
    mockUseDesktopSettingsReady: vi.fn<() => boolean>(() => true),
    mockUseDesktopSettingsSyncing: vi.fn<() => boolean>(() => false),
    mockUseDesktopRuntimeState: vi.fn<() => { trayAvailable: boolean }>(() => ({
      trayAvailable: false,
    })),
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: vi.fn<() => string>(() => 'linux'),
}));

vi.mock('$state/hooks/desktopSettings', () => ({
  useDesktopSetting: mockUseDesktopSetting,
  useDesktopSettingsReady: mockUseDesktopSettingsReady,
  useDesktopSettingsSyncing: mockUseDesktopSettingsSyncing,
  useDesktopRuntimeState: mockUseDesktopRuntimeState,
}));

vi.mock('$components/page', () => ({
  PageContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsSectionPage: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

vi.mock('folds', async () => {
  const actual = await vi.importActual<typeof Folds>('folds');
  return {
    ...actual,
    Switch: ({
      value,
      onChange,
      disabled,
      'aria-label': ariaLabel,
    }: {
      value: boolean;
      onChange: (nextValue: boolean) => void;
      disabled?: boolean;
      'aria-label'?: string;
    }) => (
      <button
        type="button"
        role="switch"
        aria-label={ariaLabel}
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
      />
    ),
  };
});

const renderDesktop = () =>
  render(
    <ScreenSizeProvider value={ScreenSize.Desktop}>
      <Desktop requestClose={vi.fn<() => void>()} />
    </ScreenSizeProvider>
  );

describe('Desktop', () => {
  it('renders explicit close behavior and tray settings', () => {
    mockUseDesktopRuntimeState.mockReturnValueOnce({
      trayAvailable: true,
    });

    const { container } = renderDesktop();

    expect(screen.getByText('Close button keeps Sable running')).toBeInTheDocument();
    expect(screen.getByText('Use custom title bar')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use Sable-drawn window controls and connection status instead of the native window chrome.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'When enabled, closing the window keeps Sable running in the system tray instead of exiting. This needs the tray icon below: without a tray to restore from, closing exits Sable.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Show system tray icon')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Show a system tray icon while Sable is running. Disable this if you want Sable to stay available without a tray icon.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Spellcheck')).toBeInTheDocument();
    expect(
      screen.getByText('Underline misspelled words and offer corrections in text fields.')
    ).toBeInTheDocument();
    expect(container.getElementsByClassName(SequenceCardStyle)).toHaveLength(5);
  });

  it('updates the spellcheck setting from the Text input switch', () => {
    renderDesktop();

    fireEvent.click(screen.getByRole('switch', { name: 'spellcheck' }));

    expect(mockSetSpellcheck).toHaveBeenCalledWith(false);
  });

  it('updates the custom title bar setting from the Window switch', () => {
    renderDesktop();

    fireEvent.click(screen.getByRole('switch', { name: 'use-custom-title-bar' }));

    expect(mockSetUseCustomTitleBar).toHaveBeenCalledWith(false);
  });

  it('shows fallback copy while the tray icon is enabled but unavailable', () => {
    renderDesktop();

    expect(
      screen.getByText(
        'System tray is unavailable on this system. Without it, closing the window exits Sable.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'show-system-tray-icon' })).toBeDisabled();
  });

  it('does not show fallback copy while tray availability is still syncing', () => {
    mockUseDesktopSettingsSyncing.mockReturnValueOnce(true);

    renderDesktop();

    expect(
      screen.queryByText(
        'System tray is unavailable on this system. Without it, closing the window exits Sable.'
      )
    ).not.toBeInTheDocument();
  });

  it('hides the tray-unavailable note when the tray is available', () => {
    mockUseDesktopRuntimeState.mockReturnValueOnce({
      trayAvailable: true,
    });

    renderDesktop();

    expect(
      screen.queryByText(
        'System tray is unavailable on this system. Without it, closing the window exits Sable.'
      )
    ).not.toBeInTheDocument();
  });
});
