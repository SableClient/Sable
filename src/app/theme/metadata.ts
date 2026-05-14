import { ThemeKind } from '$hooks/useTheme';

export type SableThemeContrast = 'low' | 'high';

export type SableThemeMetadata = {
  id: string;
  name: string;
  author?: string;
  kind: ThemeKind;
  contrast: SableThemeContrast;
  tags: string[];
  fullThemeUrl?: string;
};

export type SableTweakMetadata = {
  id: string;
  name: string;
  description?: string;
  author?: string;
  tags: string[];
};

const META_THEME = '@sable-theme';
const META_TWEAK = '@sable-tweak';

export function getSableCssPackageKind(cssText: string): 'theme' | 'tweak' | 'unknown' {
  let pos = 0;
  while (pos < cssText.length) {
    const start = cssText.indexOf('/*', pos);
    if (start === -1) break;
    const end = cssText.indexOf('*/', start + 2);
    if (end === -1) break;
    const block = cssText.slice(start + 2, end);
    if (block.indexOf(META_TWEAK) !== -1) return 'tweak';
    if (block.indexOf(META_THEME) !== -1) return 'theme';
    pos = end + 2;
  }
  return 'unknown';
}

function extractBlockCommentContaining(cssText: string, marker: string): string {
  let pos = 0;
  while (pos < cssText.length) {
    const start = cssText.indexOf('/*', pos);
    if (start === -1) return '';
    const end = cssText.indexOf('*/', start + 2);
    if (end === -1) return '';
    const block = cssText.slice(start + 2, end);
    if (block.indexOf(marker) !== -1) {
      return block;
    }
    pos = end + 2;
  }
  return '';
}

function extractSableThemeBlockComment(cssText: string): string {
  return extractBlockCommentContaining(cssText, META_THEME);
}

export function parseSableThemeMetadata(cssText: string): Partial<SableThemeMetadata> {
  const block = extractSableThemeBlockComment(cssText);
  if (!block) return {};

  const lines = block.split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, '').trim());
  const out: Partial<SableThemeMetadata> = {};
  lines
    .filter((line) => !(line.startsWith('@') || line === '---' || line === ''))
    .filter((line) => line.indexOf(':') !== -1)
    .forEach((line) => {
      const idx = line.indexOf(':');
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      switch (key) {
        case 'id':
          out.id = value;
          break;
        case 'name':
          out.name = value;
          break;
        case 'author':
          out.author = value;
          break;
        case 'kind':
          out.kind = value === 'dark' ? ThemeKind.Dark : ThemeKind.Light;
          break;
        case 'contrast':
          out.contrast = value === 'high' ? 'high' : 'low';
          break;
        case 'tags':
          out.tags = value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          break;
        case 'fullthemeurl':
        case 'full_theme_url':
          out.fullThemeUrl = value;
          break;
        default:
          break;
      }
    });
  return out;
}

export function parseSableTweakMetadata(cssText: string): Partial<SableTweakMetadata> {
  const block = extractBlockCommentContaining(cssText, META_TWEAK);
  if (!block) return {};

  const lines = block.split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, '').trim());
  const out: Partial<SableTweakMetadata> = {};
  lines
    .filter((line) => !(line.startsWith('@') || line === '---' || line === ''))
    .filter((line) => line.indexOf(':') !== -1)
    .forEach((line) => {
      const idx = line.indexOf(':');
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      switch (key) {
        case 'id':
          out.id = value;
          break;
        case 'name':
          out.name = value;
          break;
        case 'description':
          out.description = value;
          break;
        case 'author':
          out.author = value;
          break;
        case 'tags':
          out.tags = value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          break;
        default:
          break;
      }
    });
  return out;
}

export function extractFullThemeUrlFromPreview(cssText: string): string | undefined {
  const meta = parseSableThemeMetadata(cssText);
  if (meta.fullThemeUrl && /^https:\/\//i.test(meta.fullThemeUrl)) {
    return meta.fullThemeUrl;
  }
  const block = extractSableThemeBlockComment(cssText);
  if (!block) return undefined;
  const m = block.match(/fullThemeUrl:\s*(https:\/\/[^\s*]+)/i);
  return m?.[1];
}
