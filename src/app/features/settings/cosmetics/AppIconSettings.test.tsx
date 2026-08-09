import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppIconRuntimeFeature, AppIconSettings } from './AppIconSettings';

const { invoke, isAndroidTauri, isMobileOrTablet, isMobileTauri, setAppIconId, settings } =
  vi.hoisted(() => ({
    invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
    isAndroidTauri: vi.fn<() => boolean>(),
    isMobileOrTablet: vi.fn<() => boolean>(),
    isMobileTauri: vi.fn<() => boolean>(),
    setAppIconId: vi.fn<(value: string | undefined) => void>(),
    settings: { appIconId: undefined as string | undefined },
  }));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('$utils/platform', () => ({ isAndroidTauri, isMobileOrTablet, isMobileTauri }));
vi.mock('$state/hooks/settings', () => ({ useSetting: () => [settings.appIconId, setAppIconId] }));
vi.mock('$components/sequence-card', () => ({
  SequenceCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SequenceCardStyle: 'card',
}));
vi.mock('$components/setting-tile', () => ({
  SettingTile: ({ title, after }: { title: string; after: React.ReactNode }) => (
    <div>
      <span>{title}</span>
      {after}
    </div>
  ),
}));
vi.mock('$components/setting-menu-selector', () => ({
  SettingMenuSelector: ({
    options,
    onSelect,
  }: {
    options: { value: string; label: string; icon?: React.ReactNode }[];
    onSelect: (value: string) => void;
  }) => (
    <>
      {options.map((option) => (
        <button key={option.value} onClick={() => onSelect(option.value)}>
          {option.icon}
          {option.label}
        </button>
      ))}
    </>
  ),
}));

describe('AppIconSettings', () => {
  beforeEach(() => {
    invoke.mockReset();
    isAndroidTauri.mockReturnValue(false);
    isMobileOrTablet.mockReturnValue(false);
    isMobileTauri.mockReset();
    setAppIconId.mockReset();
    settings.appIconId = undefined;
  });

  it('is hidden outside mobile Tauri', () => {
    isMobileTauri.mockReturnValue(false);

    render(<AppIconSettings />);

    expect(screen.queryByText('App Icon')).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('is hidden when the native bundle has no alternate icons', async () => {
    isMobileTauri.mockReturnValue(true);
    invoke.mockResolvedValue([]);

    render(<AppIconSettings />);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.queryByText('App Icon')).not.toBeInTheDocument();
  });

  it('persists an icon only after native selection succeeds', async () => {
    isMobileTauri.mockReturnValue(true);
    invoke.mockResolvedValueOnce(['propeler']).mockResolvedValueOnce(undefined);

    render(<AppIconSettings />);

    await screen.findByText('App Icon');
    expect(screen.getByTestId('app-icon-preview-primary')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-propeler')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-primary')).toHaveStyle({ borderRadius: '22.5%' });
    fireEvent.click(screen.getByRole('button', { name: 'Propeler' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenLastCalledWith('plugin:app-icon|set_icon', {
        request: { icon: 'propeler' },
      });
    });
    expect(setAppIconId).toHaveBeenCalledWith('propeler');
  });

  it('renders circular previews on Android', async () => {
    isMobileTauri.mockReturnValue(true);
    isAndroidTauri.mockReturnValue(true);
    invoke.mockResolvedValue(['propeler']);

    render(<AppIconSettings />);

    expect(await screen.findByTestId('app-icon-preview-propeler')).toHaveStyle({
      borderRadius: '50%',
    });
  });

  it('restores the persisted icon when an update resets the native selection', async () => {
    isMobileTauri.mockReturnValue(true);
    settings.appIconId = 'propeler';
    invoke
      .mockResolvedValueOnce(['propeler'])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined);

    render(<AppIconRuntimeFeature />);

    await waitFor(() => {
      expect(invoke).toHaveBeenLastCalledWith('plugin:app-icon|set_icon', {
        request: { icon: 'propeler' },
      });
    });
  });

  it('leaves the native selection alone when it already matches', async () => {
    isMobileTauri.mockReturnValue(true);
    settings.appIconId = 'propeler';
    invoke.mockResolvedValueOnce(['propeler']).mockResolvedValueOnce('propeler');

    render(<AppIconRuntimeFeature />);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke).not.toHaveBeenCalledWith('plugin:app-icon|set_icon', expect.anything());
  });
});
