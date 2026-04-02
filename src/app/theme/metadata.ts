import { ThemeKind } from '$hooks/useTheme';

export type SableThemeContrast = 'low' | 'high';

export type SableThemeMetadata = {
  id: string;
  name: string;
  kind: ThemeKind;
  contrast: SableThemeContrast;
  tags: string[];
  legacyIds: string[];
  fullThemeUrl?: string;
};

const META_START = '@sable-theme';

/**
 * First block comment must contain @sable-theme and key: value lines.
 */
export function parseSableThemeMetadata(cssText: string): Partial<SableThemeMetadata> {
  const block = extractFirstBlockComment(cssText);
  if (!block.includes(META_START)) return {};

  const lines = block.split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, '').trim());
  const out: Partial<SableThemeMetadata> = {};
  for (const line of lines) {
    if (line.startsWith('@') || line === '---' || line === '') continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    switch (key) {
      case 'id':
        out.id = value;
        break;
      case 'name':
        out.name = value;
        break;
      case 'kind':
        out.kind = value === 'dark' ? ThemeKind.Dark : ThemeKind.Light;
        break;
      case 'contrast':
        out.contrast = value === 'high' ? 'high' : 'low';
        break;
      case 'tags':
        out.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
        break;
      case 'legacyids':
      case 'legacy_ids':
        out.legacyIds = value.split(',').map((t) => t.trim()).filter(Boolean);
        break;
      case 'fullthemeurl':
      case 'full_theme_url':
        out.fullThemeUrl = value;
        break;
      default:
        break;
    }
  }
  return out;
}

function extractFirstBlockComment(cssText: string): string {
  const start = cssText.indexOf('/*');
  if (start === -1) return '';
  const end = cssText.indexOf('*/', start + 2);
  if (end === -1) return '';
  return cssText.slice(start + 2, end);
}

export function extractFullThemeUrlFromPreview(cssText: string): string | undefined {
  const meta = parseSableThemeMetadata(cssText);
  if (meta.fullThemeUrl && /^https:\/\//i.test(meta.fullThemeUrl)) {
    return meta.fullThemeUrl;
  }
  const block = extractFirstBlockComment(cssText);
  const m = block.match(/fullThemeUrl:\s*(https:\/\/[^\s*]+)/i);
  return m?.[1];
}
