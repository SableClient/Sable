import { ThemeKind } from '$hooks/useTheme';
import { fetch } from '$utils/fetch';

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
      /** Present for pasted/uploaded local tweaks so callers can persist it with the favorite. */
      cssText?: string;
    }
  | { ok: false; error: string };

export type ProcessedUploadedSableCss =
  | {
      ok: true;
      role: 'theme';
      fullUrl?: string;
      previewCssForCard: string;
      fullCssForCard?: string;
      displayName: string;
      basename: string;
      kind: 'light' | 'dark';
      importedLocal: boolean;
      previewOnly: boolean;
    }
  | {
      ok: true;
      role: 'tweak';
      fullUrl: string;
      cssText: string;
      displayName: string;
      basename: string;
      description?: string;
      author?: string;
      tags: string[];
      importedLocal: true;
    }
  | { ok: false; error: string };

export function isSableCssAttachmentFileName(fileName: string): boolean {
  return /\.sable\.css$/i.test(fileName);
}

function fallbackStableId(sourceKey: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < sourceKey.length; i += 1) {
    const code = sourceKey.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

async function stableImportId(sourceKey: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(sourceKey);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  } catch {
    return fallbackStableId(sourceKey);
  }
}

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
      cssText: trimmed,
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

/** Process a Matrix file attachment without treating a preview-only file as a full theme. */
export async function processUploadedSableCssAttachment(
  cssText: string,
  fileName: string,
  sourceKey: string
): Promise<ProcessedUploadedSableCss> {
  const trimmed = cssText.trim();
  if (!trimmed) return { ok: false, error: 'The uploaded CSS file is empty.' };

  const packageKind = getSableCssPackageKind(trimmed);
  if (packageKind === 'unknown') {
    return {
      ok: false,
      error: 'This file does not contain @sable-theme or @sable-tweak metadata.',
    };
  }

  const stableId = await stableImportId(sourceKey);

  if (packageKind === 'tweak') {
    const meta = parseSableTweakMetadata(trimmed);
    const basename = tweakBasename(meta, fileName);
    const fullUrl = localImportTweakFullUrl(stableId);
    await putCachedThemeCss(fullUrl, trimmed);
    return {
      ok: true,
      role: 'tweak',
      fullUrl,
      cssText: trimmed,
      displayName: meta.name?.trim() || basename,
      basename,
      description: meta.description?.trim() || undefined,
      author: meta.author?.trim() || undefined,
      tags: meta.tags ?? [],
      importedLocal: true,
    };
  }

  const meta = parseSableThemeMetadata(trimmed);
  const fileBasename = fileName
    .replace(/\.preview\.sable\.css$/i, '')
    .replace(/\.sable\.css$/i, '');
  const displayName = meta.name?.trim() || fileBasename || 'Uploaded theme';
  const basename =
    meta.id?.trim() ||
    displayName.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') ||
    'uploaded';
  const isPreviewFile = /\.preview\.sable\.css$/i.test(fileName);

  if (isPreviewFile) {
    const fullUrl = extractFullThemeUrlFromPreview(trimmed);
    if (!fullUrl) {
      return {
        ok: true,
        role: 'theme',
        previewCssForCard: trimmed,
        displayName,
        basename,
        kind: metaKindToLd(meta),
        importedLocal: false,
        previewOnly: true,
      };
    }

    try {
      const response = await fetch(fullUrl, { mode: 'cors' });
      if (!response.ok) {
        return {
          ok: true,
          role: 'theme',
          previewCssForCard: trimmed,
          displayName,
          basename,
          kind: metaKindToLd(meta),
          importedLocal: false,
          previewOnly: true,
        };
      }
      const fullCss = await response.text();
      if (getSableCssPackageKind(fullCss) === 'tweak') {
        return { ok: false, error: 'The preview file points to a tweak instead of a full theme.' };
      }
      await putCachedThemeCss(fullUrl, fullCss);
      return {
        ok: true,
        role: 'theme',
        fullUrl,
        previewCssForCard: trimmed,
        fullCssForCard: fullCss,
        displayName,
        basename,
        kind: metaKindToLd(meta),
        importedLocal: false,
        previewOnly: false,
      };
    } catch {
      return {
        ok: true,
        role: 'theme',
        previewCssForCard: trimmed,
        displayName,
        basename,
        kind: metaKindToLd(meta),
        importedLocal: false,
        previewOnly: true,
      };
    }
  }

  const fullUrl = localImportFullUrl(stableId);
  const previewUrl = localImportPreviewUrl(stableId);
  await putCachedThemeCss(fullUrl, trimmed);
  await putCachedThemeCss(previewUrl, trimmed);
  return {
    ok: true,
    role: 'theme',
    fullUrl,
    previewCssForCard: trimmed,
    fullCssForCard: trimmed,
    displayName,
    basename,
    kind: metaKindToLd(meta),
    importedLocal: true,
    previewOnly: false,
  };
}
