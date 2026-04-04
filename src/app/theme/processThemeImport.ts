import { ThemeKind } from '$hooks/useTheme';

import { putCachedThemeCss } from './cache';
import {
  extractFullThemeUrlFromPreview,
  getSableCssPackageKind,
  parseSableThemeMetadata,
  parseSableTweakMetadata,
} from './metadata';
import {
  localImportFullUrl,
  localImportPreviewUrl,
  localImportTweakFullUrl,
  makeLocalImportThemeId,
  makeLocalImportTweakId,
} from './localImportUrls';

export type ProcessedThemeImport =
  | {
      ok: true;
      role: 'theme';
      fullUrl: string;
      previewCssForCard: string;
      displayName: string;
      basename: string;
      kind: 'light' | 'dark';
      importedLocal: boolean;
    }
  | {
      ok: true;
      role: 'tweak';
      fullUrl: string;
      displayName: string;
      basename: string;
      description?: string;
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

function tweakBasename(
  tweakMeta: ReturnType<typeof parseSableTweakMetadata>,
  fileName?: string
): string {
  const raw =
    tweakMeta.id?.trim() ||
    tweakMeta.name?.trim() ||
    (fileName ? fileName.replace(/\.[^.]+$/, '') : '') ||
    'tweak';
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'tweak';
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

    const pkgKind = getSableCssPackageKind(text);
    if (pkgKind === 'tweak') {
      await putCachedThemeCss(trimmed, text);
      const tm = parseSableTweakMetadata(text);
      const displayName = tm.name?.trim() || basenameFromHttpsUrl(trimmed);
      return {
        ok: true,
        role: 'tweak',
        fullUrl: trimmed,
        displayName,
        basename: tweakBasename(tm),
        description: tm.description?.trim(),
        importedLocal: false,
      };
    }

    const meta = parseSableThemeMetadata(text);
    const fullFromMeta = extractFullThemeUrlFromPreview(text);
    const isPreviewPath = /\.preview\.sable\.css(\?|#|$)/i.test(trimmed);

    if (fullFromMeta && /^https:\/\//i.test(fullFromMeta)) {
      if (fullFromMeta === trimmed) {
        await putCachedThemeCss(trimmed, text);
        const displayName = meta.name?.trim() || basenameFromHttpsUrl(trimmed);
        return {
          ok: true,
          role: 'theme',
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
        role: 'theme',
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
          const fullPkg = getSableCssPackageKind(fullCss);
          if (fullPkg === 'tweak') {
            await putCachedThemeCss(guessed, fullCss);
            await putCachedThemeCss(trimmed, text);
            const tm = parseSableTweakMetadata(fullCss);
            const displayName = tm.name?.trim() || basenameFromHttpsUrl(guessed);
            return {
              ok: true,
              role: 'tweak',
              fullUrl: guessed,
              displayName,
              basename: tweakBasename(tm),
              description: tm.description?.trim(),
              importedLocal: false,
            };
          }
          await putCachedThemeCss(guessed, fullCss);
          await putCachedThemeCss(trimmed, text);
          const displayName = meta.name?.trim() || basenameFromHttpsUrl(guessed);
          return {
            ok: true,
            role: 'theme',
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
      role: 'theme',
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

  const pkgKind = getSableCssPackageKind(trimmed);
  if (pkgKind === 'tweak') {
    const tweakMeta = parseSableTweakMetadata(trimmed);
    const displayName =
      tweakMeta.name?.trim() ||
      (fileName ? fileName.replace(/\.[^.]+$/, '') : '') ||
      'Imported tweak';
    const basename = tweakBasename(tweakMeta, fileName);
    const id = makeLocalImportTweakId();
    const fullU = localImportTweakFullUrl(id);
    await putCachedThemeCss(fullU, trimmed);
    return {
      ok: true,
      role: 'tweak',
      fullUrl: fullU,
      displayName,
      basename,
      description: tweakMeta.description?.trim(),
      importedLocal: true,
    };
  }

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
        const remoteKind = getSableCssPackageKind(fullCss);
        if (remoteKind === 'tweak') {
          await putCachedThemeCss(fullFromMeta, fullCss);
          const tm = parseSableTweakMetadata(fullCss);
          return {
            ok: true,
            role: 'tweak',
            fullUrl: fullFromMeta,
            displayName: tm.name?.trim() || basenameFromHttpsUrl(fullFromMeta),
            basename: tweakBasename(tm),
            description: tm.description?.trim(),
            importedLocal: false,
          };
        }
        await putCachedThemeCss(fullFromMeta, fullCss);
        const previewMeta = parseSableThemeMetadata(trimmed);
        return {
          ok: true,
          role: 'theme',
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
    role: 'theme',
    fullUrl: fullU,
    previewCssForCard: trimmed,
    displayName,
    basename,
    kind: metaKindToLd(meta),
    importedLocal: true,
  };
}
