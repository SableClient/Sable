import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ThemeModule from '$hooks/useTheme';

import { Appearance } from './Themes';

type SettingsShape = {
  themeId?: string;
  useSystemTheme: boolean;
  themeCatalogOnboardingDone: boolean;
  themeMigrationDismissed: boolean;
  themeRemoteCatalogEnabled: boolean;
  themeRemoteFavorites: unknown[];
  themeRemoteTweakFavorites: unknown[];
  themeRemoteEnabledTweakFullUrls: string[];
  lightThemeId?: string;
  darkThemeId?: string;
  useSystemArboriumTheme: boolean;
  arboriumThemeId?: string;
  arboriumLightTheme?: string;
  arboriumDarkTheme?: string;
  saturationLevel: number;
  underlineLinks: boolean;
  reducedMotion: boolean;
  autoplayGifs: boolean;
  autoplayStickers: boolean;
  autoplayEmojis: boolean;
  incomingInlineImagesDefaultHeight: number;
  incomingInlineImagesMaxHeight: number;
  linkPreviewImageMaxHeight: number;
  twitterEmoji: boolean;
  showEasterEggs: boolean;
  subspaceHierarchyLimit: number;
  pageZoom: number;
};

let currentSettings: SettingsShape;
const setters = new Map<string, () => void>();

const getSetter = (key: string) => {
  if (!setters.has(key)) {
    setters.set(key, vi.fn<() => void>());
  }

  return setters.get(key)!;
};

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: keyof SettingsShape) => [currentSettings[key], getSetter(key)],
}));

vi.mock('$hooks/useTheme', async () => {
  const actual = await vi.importActual<typeof ThemeModule>('$hooks/useTheme');

  return {
    ...actual,
    useSystemThemeKind: () => actual.ThemeKind.Light,
  };
});

beforeEach(() => {
  setters.clear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi
      .fn<
        () => { matches: boolean; addEventListener: () => void; removeEventListener: () => void }
      >()
      .mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
      })),
  });
  currentSettings = {
    themeId: 'silver-theme',
    useSystemTheme: true,
    themeCatalogOnboardingDone: true,
    themeMigrationDismissed: true,
    themeRemoteCatalogEnabled: false,
    themeRemoteFavorites: [],
    themeRemoteTweakFavorites: [],
    themeRemoteEnabledTweakFullUrls: [],
    lightThemeId: 'cinny-light-theme',
    darkThemeId: 'black-theme',
    useSystemArboriumTheme: true,
    arboriumThemeId: 'dracula',
    arboriumLightTheme: 'github-light',
    arboriumDarkTheme: 'dracula',
    saturationLevel: 100,
    underlineLinks: false,
    reducedMotion: false,
    autoplayGifs: true,
    autoplayStickers: true,
    autoplayEmojis: true,
    incomingInlineImagesDefaultHeight: 32,
    incomingInlineImagesMaxHeight: 64,
    linkPreviewImageMaxHeight: 320,
    twitterEmoji: true,
    showEasterEggs: true,
    subspaceHierarchyLimit: 3,
    pageZoom: 100,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const clickLatestButton = (name: string) => {
  const nodes = screen.getAllByText(name);
  fireEvent.click(nodes.at(-1)!);
};

const getFirstEnabledButton = (name: string) =>
  screen.getAllByRole('button', { name }).find((node) => !node.hasAttribute('disabled'));

describe('Appearance settings', () => {
  it('renders Theme, Display, Code Block Theme, and Visual Tweaks as separate sections', () => {
    render(<Appearance />);

    const themeHeading = screen.getByText('Theme');
    const displayHeading = screen.getByText('Display');
    const codeBlockThemeHeading = screen.getByText('Code Block Theme');
    const visualTweaksHeading = screen.getByText('Visual Tweaks');

    expect(themeHeading.compareDocumentPosition(displayHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(displayHeading.compareDocumentPosition(codeBlockThemeHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(codeBlockThemeHeading.compareDocumentPosition(visualTweaksHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getAllByRole('button', { name: 'Light' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'GitHub Light' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Dracula' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Dracula' }).at(-1)).toBeDisabled();
  });

  it('updates the manual app and code block theme settings when system theme is disabled', () => {
    currentSettings = {
      ...currentSettings,
      useSystemTheme: false,
      useSystemArboriumTheme: false,
    };

    render(<Appearance />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Light' }).at(-1)!);
    clickLatestButton('Dark');

    fireEvent.click(screen.getByRole('button', { name: 'Dracula' }));
    clickLatestButton('Ayu Light');

    expect(getSetter('themeId')).toHaveBeenCalledWith('dark-theme');
    expect(getSetter('arboriumThemeId')).toHaveBeenCalledWith('ayu-light');
  });

  it('updates the system code block theme settings when the chip selectors change', () => {
    render(<Appearance />);

    fireEvent.click(screen.getByRole('button', { name: 'GitHub Light' }));
    clickLatestButton('Ayu Light');

    fireEvent.click(getFirstEnabledButton('Dracula')!);
    clickLatestButton('One Dark');

    expect(getSetter('arboriumLightTheme')).toHaveBeenCalledWith('ayu-light');
    expect(getSetter('arboriumDarkTheme')).toHaveBeenCalledWith('one-dark');
  });

  it('falls back to light theme ids when the stored app theme ids are invalid', () => {
    currentSettings = {
      ...currentSettings,
      useSystemTheme: false,
      themeId: 'not-a-theme',
    };

    render(<Appearance />);

    expect(screen.getAllByRole('button', { name: 'Light' }).length).toBeGreaterThan(0);
  });

  it('falls back to the active code block system theme when the stored manual theme id is invalid', () => {
    currentSettings = {
      ...currentSettings,
      useSystemArboriumTheme: false,
      arboriumThemeId: 'not-a-theme',
    };

    render(<Appearance />);

    expect(screen.getByRole('button', { name: 'GitHub Light' })).toBeInTheDocument();
  });

  it('falls back to the default light and dark theme ids for invalid system theme values', () => {
    currentSettings = {
      ...currentSettings,
      themeId: 'silver-theme',
      lightThemeId: 'not-a-light-theme',
      darkThemeId: 'not-a-dark-theme',
    };

    render(<Appearance />);

    expect(screen.getAllByRole('button', { name: 'Light' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Dark' }).length).toBeGreaterThan(0);
  });
});
