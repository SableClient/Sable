import type { ReactNode } from 'react';
import type * as SettingsModule from '$state/settings';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Experimental } from './Experimental';

const { mockSetNewCallsEnabled, mockUseSetting } = vi.hoisted(() => ({
  mockSetNewCallsEnabled: vi.fn<(value: boolean) => void>(),
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
  mockSetNewCallsEnabled.mockReset();
  mockUseSetting.mockImplementation((_atom: unknown, key: string) => {
    if (key === 'newCallsEnabled') return [false, mockSetNewCallsEnabled];
    return [false, vi.fn<() => void>()];
  });
});

describe('Experimental new calls setting', () => {
  it('shows one new calls toggle', () => {
    render(<Experimental requestClose={() => {}} />);

    expect(screen.getByText('New calls')).toBeInTheDocument();
    expect(screen.getByText('Enable new calls')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Uses LiveKit JS on web and desktop, and native LiveKit on supported mobile devices. Element Call remains the fallback.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/manual media|connection probe/i)).not.toBeInTheDocument();
  });

  it('persists the opt-in through the settings hook', () => {
    render(<Experimental requestClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'new-calls' }));

    expect(mockSetNewCallsEnabled).toHaveBeenCalledWith(true);
  });
});
