import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppIconSettings } from './AppIconSettings';

const { invoke, isAndroidTauri, isMobileOrTablet, isMobileTauri } = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
  isAndroidTauri: vi.fn<() => boolean>(),
  isMobileOrTablet: vi.fn<() => boolean>(),
  isMobileTauri: vi.fn<() => boolean>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('$utils/platform', () => ({ isAndroidTauri, isMobileOrTablet, isMobileTauri }));
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
  });

  it('is hidden outside mobile Tauri', () => {
    isMobileTauri.mockReturnValue(false);

    render(<AppIconSettings />);

    expect(screen.queryByText('App Icon')).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('is hidden when the native bundle has no alternate icons', async () => {
    isMobileTauri.mockReturnValue(true);
    invoke.mockResolvedValueOnce([]).mockResolvedValueOnce(null);

    render(<AppIconSettings />);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.queryByText('App Icon')).not.toBeInTheDocument();
  });

  it('changes the icon only after an explicit selection', async () => {
    isMobileTauri.mockReturnValue(true);
    invoke
      .mockResolvedValueOnce([
        'propeller',
        'agender',
        'bisexual',
        'trans',
        'transgradient',
        'intersex',
        'lesbian',
        'mlm',
        'pride',
      ])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined);

    render(<AppIconSettings />);

    await screen.findByText('App Icon');
    expect(screen.getByTestId('app-icon-preview-primary')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-propeller')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-agender')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-bisexual')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-trans')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-transgradient')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-intersex')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-lesbian')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-mlm')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-pride')).toBeInTheDocument();
    expect(screen.getByTestId('app-icon-preview-primary')).toHaveStyle({ borderRadius: '22.5%' });
    fireEvent.click(screen.getByRole('button', { name: 'Propeller' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenLastCalledWith('plugin:app-icon|set_icon', {
        request: { icon: 'propeller' },
      });
    });
  });

  it('reads the current selection from the native plugin', async () => {
    isMobileTauri.mockReturnValue(true);
    invoke.mockResolvedValueOnce(['propeller']).mockResolvedValueOnce('propeller');

    render(<AppIconSettings />);

    await screen.findByText('App Icon');
    expect(invoke).toHaveBeenNthCalledWith(1, 'plugin:app-icon|get_available_icons');
    expect(invoke).toHaveBeenNthCalledWith(2, 'plugin:app-icon|get_current_icon');
    expect(invoke).not.toHaveBeenCalledWith('plugin:app-icon|set_icon', expect.anything());
  });

  it('renders circular previews on Android', async () => {
    isMobileTauri.mockReturnValue(true);
    isAndroidTauri.mockReturnValue(true);
    invoke.mockResolvedValueOnce(['propeller']).mockResolvedValueOnce(null);

    render(<AppIconSettings />);

    expect(await screen.findByTestId('app-icon-preview-propeller')).toHaveStyle({
      borderRadius: '50%',
    });
  });
});
