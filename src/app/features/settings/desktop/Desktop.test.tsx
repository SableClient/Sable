import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { Desktop } from './Desktop';

const {
  mockUseDesktopSetting,
  mockUseDesktopSettingsReady,
  mockUseDesktopRuntimeState,
  mockUseDesktopSettingsSyncing,
} = vi.hoisted(() => ({
  mockUseDesktopSetting: vi.fn((key: 'closeToBackgroundOnClose' | 'showSystemTrayIcon') => {
    if (key === 'closeToBackgroundOnClose') return [true, vi.fn()] as const;
    return [true, vi.fn()] as const;
  }),
  mockUseDesktopSettingsReady: vi.fn(() => true),
  mockUseDesktopSettingsSyncing: vi.fn(() => false),
  mockUseDesktopRuntimeState: vi.fn(() => ({
    trayAvailable: false,
  })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
}));

vi.mock('$state/hooks/desktopSettings', () => ({
  useDesktopSetting: mockUseDesktopSetting,
  useDesktopSettingsReady: mockUseDesktopSettingsReady,
  useDesktopSettingsSyncing: mockUseDesktopSettingsSyncing,
  useDesktopRuntimeState: mockUseDesktopRuntimeState,
}));

vi.mock('folds', async () => {
  const actual = await vi.importActual<typeof import('folds')>('folds');
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

describe('Desktop', () => {
  it('renders explicit close behavior and tray settings', () => {
    mockUseDesktopRuntimeState.mockReturnValueOnce({
      trayAvailable: true,
    });

    const { container } = render(<Desktop requestClose={vi.fn()} />);

    expect(screen.getByText('Close button keeps Sable running')).toBeInTheDocument();
    expect(
      screen.getByText(
        'When enabled, closing the window keeps Sable running instead of exiting. If the tray icon is enabled and available, Sable stays in the system tray. Otherwise it continues running in the background.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Show system tray icon')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Show a system tray icon while Sable is running. Disable this if you want Sable to stay available without a tray icon.'
      )
    ).toBeInTheDocument();
    expect(container.getElementsByClassName(SequenceCardStyle)).toHaveLength(2);
  });

  it('shows fallback copy while the tray icon is enabled but unavailable', () => {
    render(<Desktop requestClose={vi.fn()} />);

    expect(
      screen.getByText(
        'System tray is unavailable on this system. Sable can still keep running in the background without it.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'show-system-tray-icon' })).toBeDisabled();
  });

  it('does not show fallback copy while tray availability is still syncing', () => {
    mockUseDesktopSettingsSyncing.mockReturnValueOnce(true);

    render(<Desktop requestClose={vi.fn()} />);

    expect(
      screen.queryByText(
        'System tray is unavailable on this system. Sable can still keep running in the background without it.'
      )
    ).not.toBeInTheDocument();
  });

  it('hides the tray-unavailable note when the tray is available', () => {
    mockUseDesktopRuntimeState.mockReturnValueOnce({
      trayAvailable: true,
    });

    render(<Desktop requestClose={vi.fn()} />);

    expect(
      screen.queryByText(
        'System tray is unavailable on this system. Sable can still keep running in the background without it.'
      )
    ).not.toBeInTheDocument();
  });
});
