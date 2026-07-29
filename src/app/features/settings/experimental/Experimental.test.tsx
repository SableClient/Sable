import type { ReactNode } from 'react';
import type * as SettingsModule from '$state/settings';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Experimental } from './Experimental';

const { mockSetLiveKitJsCallsEnabled, mockSetLiveKitJsMediaTestEnabled, mockUseSetting } =
  vi.hoisted(() => ({
    mockSetLiveKitJsCallsEnabled: vi.fn<(value: boolean) => void>(),
    mockSetLiveKitJsMediaTestEnabled: vi.fn<(value: boolean) => void>(),
    mockUseSetting:
      vi.fn<(_atom: unknown, key: string) => readonly [boolean, (value: boolean) => void]>(),
  }));

vi.mock('$state/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return { ...actual, settingsAtom: {} };
});

vi.mock('$state/hooks/settings', () => ({
  useSetting: mockUseSetting,
}));

vi.mock('$components/page', () => ({
  PageContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsSectionPage: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

vi.mock('$components/info-card', () => ({
  InfoCard: () => <div>Experimental warning</div>,
}));

vi.mock('$components/setting-tile', () => ({
  SettingToggle: ({
    title,
    description,
    focusId,
    value,
    onChange,
  }: {
    title: string;
    description: ReactNode;
    focusId: string;
    value: boolean;
    onChange: (value: boolean) => void;
  }) => (
    <div>
      <span>{title}</span>
      <span>{description}</span>
      <button type="button" aria-label={focusId} onClick={() => onChange(!value)}>
        {String(value)}
      </button>
    </div>
  ),
}));

vi.mock('./BandwithSavingEmojis', () => ({ BandwidthSavingEmojis: () => null }));
vi.mock('./MSC4268HistoryShare', () => ({ MSC4268HistoryShare: () => null }));
vi.mock('./MSC4274MediaGalleries', () => ({ MSC4274MediaGalleries: () => null }));

vi.mock('folds', () => ({
  Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Scroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

beforeEach(() => {
  mockSetLiveKitJsCallsEnabled.mockReset();
  mockSetLiveKitJsMediaTestEnabled.mockReset();
  mockUseSetting.mockImplementation((_atom: unknown, key: string) => {
    if (key === 'livekitJsCallsEnabled') return [false, mockSetLiveKitJsCallsEnabled];
    if (key === 'livekitJsMediaTestEnabled') return [false, mockSetLiveKitJsMediaTestEnabled];
    return [false, vi.fn<() => void>()];
  });
});

describe('Experimental LiveKit JS calls setting', () => {
  it('shows the connection probe toggle on Tauri and plain browser builds', () => {
    render(<Experimental requestClose={() => {}} />);

    expect(screen.getByText('LiveKit JS Calls')).toBeInTheDocument();
    expect(screen.getByText('Try the LiveKit JS connection probe')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Runs an experimental LiveKit JS connection probe. It does not publish media. Element Call remains the normal fallback.'
      )
    ).toBeInTheDocument();
  });

  it('persists the opt-in through the settings hook', () => {
    render(<Experimental requestClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'livekit-js-calls' }));

    expect(mockSetLiveKitJsCallsEnabled).toHaveBeenCalledWith(true);
  });

  it('shows the manual media test only when the connection probe is enabled', () => {
    const { rerender } = render(<Experimental requestClose={() => {}} />);

    expect(screen.queryByText('Enable the manual LiveKit JS media test')).not.toBeInTheDocument();

    mockUseSetting.mockImplementation((_atom: unknown, key: string) => {
      if (key === 'livekitJsCallsEnabled') return [true, mockSetLiveKitJsCallsEnabled];
      if (key === 'livekitJsMediaTestEnabled') return [false, mockSetLiveKitJsMediaTestEnabled];
      return [false, vi.fn<() => void>()];
    });
    rerender(<Experimental requestClose={() => {}} />);

    expect(screen.getByText('Enable the manual LiveKit JS media test')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Manual local media test only. Encrypted media is required. There is no fallback or automatic call selection. This is not release-ready.'
      )
    ).toBeInTheDocument();
  });

  it('persists the manual media test opt-in through the settings hook', () => {
    mockUseSetting.mockImplementation((_atom: unknown, key: string) => {
      if (key === 'livekitJsCallsEnabled') return [true, mockSetLiveKitJsCallsEnabled];
      if (key === 'livekitJsMediaTestEnabled') return [false, mockSetLiveKitJsMediaTestEnabled];
      return [false, vi.fn<() => void>()];
    });

    render(<Experimental requestClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'livekit-js-media-test' }));

    expect(mockSetLiveKitJsMediaTestEnabled).toHaveBeenCalledWith(true);
  });
});
