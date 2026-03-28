import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Appearance } from './Themes';

type SettingsShape = {
  themeId?: string;
  useSystemTheme: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  arboriumLightTheme?: string;
  arboriumDarkTheme?: string;
  saturationLevel: number;
  underlineLinks: boolean;
  reducedMotion: boolean;
  autoplayGifs: boolean;
  autoplayStickers: boolean;
  autoplayEmojis: boolean;
  twitterEmoji: boolean;
  showEasterEggs: boolean;
  subspaceHierarchyLimit: number;
  pageZoom: number;
};

let currentSettings: SettingsShape;
const setters = new Map<string, ReturnType<typeof vi.fn>>();

const getSetter = (key: string) => {
  if (!setters.has(key)) {
    setters.set(key, vi.fn());
  }

  return setters.get(key)!;
};

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: keyof SettingsShape) => [currentSettings[key], getSetter(key)],
}));

vi.mock('$hooks/useTheme', async () => {
  const actual = await vi.importActual<typeof import('$hooks/useTheme')>('$hooks/useTheme');

  return {
    ...actual,
    useSystemThemeKind: () => actual.ThemeKind.Light,
  };
});

beforeEach(() => {
  setters.clear();
  currentSettings = {
    themeId: 'silver-theme',
    useSystemTheme: true,
    lightThemeId: 'cinny-light-theme',
    darkThemeId: 'black-theme',
    arboriumLightTheme: 'github-light',
    arboriumDarkTheme: 'one-dark',
    saturationLevel: 100,
    underlineLinks: false,
    reducedMotion: false,
    autoplayGifs: true,
    autoplayStickers: true,
    autoplayEmojis: true,
    twitterEmoji: true,
    showEasterEggs: true,
    subspaceHierarchyLimit: 3,
    pageZoom: 100,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

const clickLatestButton = (name: string) => {
  const nodes = screen.getAllByText(name);
  fireEvent.click(nodes.at(-1)!);
};

describe('Appearance settings', () => {
  it('renders shared selector-backed theme controls and Arborium code block selectors', () => {
    render(<Appearance />);

    expect(screen.getByRole('button', { name: 'Silver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cinny Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Black' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GitHub Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'One Dark' })).toBeInTheDocument();
  });

  it('updates the manual and Arborium theme settings when selections change', () => {
    currentSettings = {
      ...currentSettings,
      useSystemTheme: false,
    };

    render(<Appearance />);

    fireEvent.click(screen.getByRole('button', { name: 'Silver' }));
    clickLatestButton('Dark');

    fireEvent.click(screen.getByRole('button', { name: 'GitHub Light' }));
    clickLatestButton('Ayu Light');

    fireEvent.click(screen.getByRole('button', { name: 'One Dark' }));
    clickLatestButton('Dracula');

    expect(getSetter('themeId')).toHaveBeenCalledWith('dark-theme');
    expect(getSetter('arboriumLightTheme')).toHaveBeenCalledWith('ayu-light');
    expect(getSetter('arboriumDarkTheme')).toHaveBeenCalledWith('dracula');
  });

  it('updates the system theme settings when the chip selectors change', () => {
    render(<Appearance />);

    fireEvent.click(screen.getByRole('button', { name: 'Cinny Light' }));
    clickLatestButton('Silver');

    fireEvent.click(screen.getByRole('button', { name: 'Black' }));
    clickLatestButton('Dark');

    expect(getSetter('lightThemeId')).toHaveBeenCalledWith('silver-theme');
    expect(getSetter('darkThemeId')).toHaveBeenCalledWith('dark-theme');
  });

  it('falls back to light theme ids when the stored app theme ids are invalid', () => {
    currentSettings = {
      ...currentSettings,
      useSystemTheme: false,
      themeId: 'not-a-theme',
    };

    render(<Appearance />);

    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
  });

  it('falls back to the default light and dark theme ids for invalid system theme values', () => {
    currentSettings = {
      ...currentSettings,
      themeId: 'silver-theme',
      lightThemeId: 'not-a-light-theme',
      darkThemeId: 'not-a-dark-theme',
    };

    render(<Appearance />);

    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  });
});
