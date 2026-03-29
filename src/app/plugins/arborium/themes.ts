export type ArboriumThemeKind = 'light' | 'dark';

export const ARBORIUM_CDN_VERSION = '2.16.0';

const ARBORIUM_THEME_DEFINITIONS = [
  { id: 'alabaster', label: 'Alabaster', kind: 'light' },
  { id: 'ayu-light', label: 'Ayu Light', kind: 'light' },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', kind: 'light' },
  { id: 'dayfox', label: 'Dayfox', kind: 'light' },
  { id: 'desert256', label: 'Desert 256', kind: 'light' },
  { id: 'github-light', label: 'GitHub Light', kind: 'light' },
  { id: 'gruvbox-light', label: 'Gruvbox Light', kind: 'light' },
  { id: 'light-owl', label: 'Light Owl', kind: 'light' },
  { id: 'lucius-light', label: 'Lucius Light', kind: 'light' },
  { id: 'melange-light', label: 'Melange Light', kind: 'light' },
  { id: 'solarized-light', label: 'Solarized Light', kind: 'light' },
  { id: 'rustdoc-light', label: 'Rustdoc Light', kind: 'light' },
  { id: 'github-dark', label: 'GitHub Dark', kind: 'dark' },
  { id: 'one-dark', label: 'One Dark', kind: 'dark' },
  { id: 'nord', label: 'Nord', kind: 'dark' },
  { id: 'dracula', label: 'Dracula', kind: 'dark' },
  { id: 'tokyo-night', label: 'Tokyo Night', kind: 'dark' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', kind: 'dark' },
  { id: 'catppuccin-macchiato', label: 'Catppuccin Macchiato', kind: 'dark' },
  { id: 'catppuccin-frappe', label: 'Catppuccin Frappe', kind: 'dark' },
  { id: 'rose-pine-moon', label: 'Rose Pine Moon', kind: 'dark' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', kind: 'dark' },
  { id: 'ayu-dark', label: 'Ayu Dark', kind: 'dark' },
  { id: 'kanagawa-dragon', label: 'Kanagawa Dragon', kind: 'dark' },
  { id: 'solarized-dark', label: 'Solarized Dark', kind: 'dark' },
  { id: 'melange-dark', label: 'Melange Dark', kind: 'dark' },
  { id: 'monokai', label: 'Monokai', kind: 'dark' },
  { id: 'zenburn', label: 'Zenburn', kind: 'dark' },
  { id: 'cobalt2', label: 'Cobalt2', kind: 'dark' },
  { id: 'ef-melissa-dark', label: 'Ef Melissa Dark', kind: 'dark' },
  { id: 'rustdoc-dark', label: 'Rustdoc Dark', kind: 'dark' },
  { id: 'rustdoc-ayu', label: 'Rustdoc Ayu', kind: 'dark' },
] as const;

type ArboriumThemeDefinition = (typeof ARBORIUM_THEME_DEFINITIONS)[number];

export type ArboriumThemeId = ArboriumThemeDefinition['id'];

export type ArboriumTheme = {
  id: ArboriumThemeId;
  label: string;
  kind: ArboriumThemeKind;
};

export const DEFAULT_ARBORIUM_LIGHT_THEME: ArboriumThemeId = 'github-light';
export const DEFAULT_ARBORIUM_DARK_THEME: ArboriumThemeId = 'dracula';

const ARBORIUM_THEMES: ArboriumTheme[] = [...ARBORIUM_THEME_DEFINITIONS];

const ARBORIUM_THEME_IDS = new Set<ArboriumThemeId>(ARBORIUM_THEMES.map((theme) => theme.id));

export const getArboriumThemeOptions = (kind: ArboriumThemeKind): ArboriumTheme[] =>
  ARBORIUM_THEMES.filter((theme) => theme.kind === kind);

export const isArboriumThemeId = (themeId: string): themeId is ArboriumThemeId =>
  ARBORIUM_THEME_IDS.has(themeId as ArboriumThemeId);

export const getArboriumThemeLabel = (themeId: ArboriumThemeId): string =>
  ARBORIUM_THEMES.find((theme) => theme.id === themeId)?.label ?? themeId;

export const getArboriumThemeHref = (themeId: ArboriumThemeId): string =>
  `https://cdn.jsdelivr.net/npm/@arborium/arborium@${ARBORIUM_CDN_VERSION}/dist/themes/${themeId}.css`;
