import { ThemeKind } from '$hooks/useTheme';

import { putCachedThemeCss } from './cache';
import { extractFullThemeUrlFromPreview, parseSableThemeMetadata } from './metadata';
import {
  localImportFullUrl,
  localImportPreviewUrl,
  makeLocalImportThemeId,
} from './localImportUrls';

export type ProcessedThemeImport =
  | {
      ok: true;
      fullUrl: string;
      previewCssForCard: string;
      displayName: string;
      basename: string;
      kind: 'light' | 'dark';
      importedLocal: boolean;
    }
  | { ok: false; error: string };

function basenameFromHttpsUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').pop() ?? 'theme';
    return seg.replace(/\.(preview\.)?sable\.css$/i, '');
  } catch {
    return 'theme';
  }
}

function metaKindToLd(meta: ReturnType<typeof parseSableThemeMetadata>): 'light' | 'dark' {
  if (meta.kind === ThemeKind.Dark) return 'dark';
  if (meta.kind === ThemeKind.Light) return 'light';
  return 'light';
}

export async function processImportedHttpsUrl(url: string): Promise<ProcessedThemeImport> {
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    return { ok: false, error: 'URL must start with https://' };
  }
  try {
    const res = await fetch(trimmed, { mode: 'cors' });
    if (!res.ok) return { ok: false, error: `Download failed (${res.status}).` };
    const text = await res.text();
    const meta = parseSableThemeMetadata(text);
    const fullFromMeta = extractFullThemeUrlFromPreview(text);
    const isPreviewPath = /\.preview\.sable\.css(\?|#|$)/i.test(trimmed);

    if (fullFromMeta && /^https:\/\//i.test(fullFromMeta)) {
      if (fullFromMeta === trimmed) {
        await putCachedThemeCss(trimmed, text);
        const displayName = meta.name?.trim() || basenameFromHttpsUrl(trimmed);
        return {
          ok: true,
          fullUrl: trimmed,
          previewCssForCard: text,
          displayName,
          basename: basenameFromHttpsUrl(trimmed),
          kind: metaKindToLd(meta),
          importedLocal: false,
        };
      }
      const fullRes = await fetch(fullFromMeta, { mode: 'cors' });
      if (!fullRes.ok)
        return { ok: false, error: `Full theme download failed (${fullRes.status}).` };
      const fullCss = await fullRes.text();
      await putCachedThemeCss(fullFromMeta, fullCss);
      await putCachedThemeCss(trimmed, text);
      const displayName = meta.name?.trim() || basenameFromHttpsUrl(fullFromMeta);
      return {
        ok: true,
        fullUrl: fullFromMeta,
        previewCssForCard: text,
        displayName,
        basename: basenameFromHttpsUrl(fullFromMeta),
        kind: metaKindToLd(meta),
        importedLocal: false,
      };
    }

    if (isPreviewPath) {
      const guessed = trimmed.replace(/\.preview\.sable\.css(\?|#|$)/i, '.sable.css$1');
      if (guessed !== trimmed) {
        const fullRes = await fetch(guessed, { mode: 'cors' });
        if (fullRes.ok) {
          const fullCss = await fullRes.text();
          await putCachedThemeCss(guessed, fullCss);
          await putCachedThemeCss(trimmed, text);
          const displayName = meta.name?.trim() || basenameFromHttpsUrl(guessed);
          return {
            ok: true,
            fullUrl: guessed,
            previewCssForCard: text,
            displayName,
            basename: basenameFromHttpsUrl(guessed),
            kind: metaKindToLd(meta),
            importedLocal: false,
          };
        }
      }
    }

    await putCachedThemeCss(trimmed, text);
    const displayName = meta.name?.trim() || basenameFromHttpsUrl(trimmed);
    return {
      ok: true,
      fullUrl: trimmed,
      previewCssForCard: text,
      displayName,
      basename: basenameFromHttpsUrl(trimmed),
      kind: metaKindToLd(meta),
      importedLocal: false,
    };
  } catch {
    return { ok: false, error: 'Network error while downloading theme.' };
  }
}

export async function processPastedOrUploadedCss(
  cssText: string,
  fileName?: string
): Promise<ProcessedThemeImport> {
  const trimmed = cssText.trim();
  if (!trimmed) return { ok: false, error: 'No CSS content.' };

  const meta = parseSableThemeMetadata(trimmed);
  const fullFromMeta = extractFullThemeUrlFromPreview(trimmed);
  const displayName =
    meta.name?.trim() || (fileName ? fileName.replace(/\.[^.]+$/, '') : '') || 'Imported theme';
  const basename = displayName.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'imported';

  if (fullFromMeta && /^https:\/\//i.test(fullFromMeta)) {
    try {
      const fullRes = await fetch(fullFromMeta, { mode: 'cors' });
      if (fullRes.ok) {
        const fullCss = await fullRes.text();
        await putCachedThemeCss(fullFromMeta, fullCss);
        const previewMeta = parseSableThemeMetadata(trimmed);
        return {
          ok: true,
          fullUrl: fullFromMeta,
          previewCssForCard: trimmed,
          displayName: previewMeta.name?.trim() || basenameFromHttpsUrl(fullFromMeta),
          basename: basenameFromHttpsUrl(fullFromMeta),
          kind: metaKindToLd(meta),
          importedLocal: false,
        };
      }
    } catch {
      /* unreachable URL / CORS — fall through to local import */
    }
  }

  const id = makeLocalImportThemeId();
  const fullU = localImportFullUrl(id);
  const prevU = localImportPreviewUrl(id);
  await putCachedThemeCss(fullU, trimmed);
  await putCachedThemeCss(prevU, trimmed);

  return {
    ok: true,
    fullUrl: fullU,
    previewCssForCard: trimmed,
    displayName,
    basename,
    kind: metaKindToLd(meta),
    importedLocal: true,
  };
}
