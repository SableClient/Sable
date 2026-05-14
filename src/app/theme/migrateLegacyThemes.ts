import { ThemeKind } from '$hooks/useTheme';
import type { Settings, ThemeRemoteFavorite } from '$state/settings';
import { trimTrailingSlash } from '$utils/common';

import { putCachedThemeCss } from './cache';
import { DEFAULT_THEME_CATALOG_BASE } from './catalogDefaults';
import {
  catalogFullUrlForBasename,
  inferLegacyKindFromBasename,
  isLegacyThemeId,
  legacyThemeIdToBasename,
} from './legacyToCatalogMap';
import { parseSableThemeMetadata } from './metadata';

type FetchOk = {
  kind: 'light' | 'dark';
  displayName: string;
  basename: string;
};

async function fetchAndCacheTheme(
  url: string
): Promise<{ ok: true; data: FetchOk } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return { ok: false, error: `Could not download theme (${res.status}).` };
    const text = await res.text();
    await putCachedThemeCss(url, text);
    const meta = parseSableThemeMetadata(text);
    const basenameFromUrl =
      url
        .replace(/\.sable\.css$/i, '')
        .split('/')
        .pop() ?? 'theme';
    const basename = meta.id?.trim() || basenameFromUrl;
    let kind: 'light' | 'dark';
    if (meta.kind === ThemeKind.Dark) kind = 'dark';
    else if (meta.kind === ThemeKind.Light) kind = 'light';
    else kind = inferLegacyKindFromBasename(basename);
    const displayName = meta.name?.trim() || basename;
    return { ok: true, data: { kind, displayName, basename } };
  } catch {
    return { ok: false, error: 'Network error while downloading theme.' };
  }
}

function normalizeCatalogBase(catalogBase: string): string {
  return trimTrailingSlash(catalogBase.length > 0 ? catalogBase : DEFAULT_THEME_CATALOG_BASE);
}

type Assign = 'manual' | 'light' | 'dark';

export async function runLegacyThemeMigration(
  settings: Settings,
  catalogBase: string
): Promise<{ ok: true; partial: Partial<Settings> } | { ok: false; error: string }> {
  const base = normalizeCatalogBase(catalogBase);

  const partial: Partial<Settings> = {
    themeMigrationDismissed: true,
    themeRemoteCatalogEnabled: true,
    themeCatalogOnboardingDone: true,
  };

  const tasks: { legacyId: string; url: string; assign: Assign }[] = [];

  if (!settings.useSystemTheme && isLegacyThemeId(settings.themeId)) {
    const id = settings.themeId!;
    tasks.push({
      legacyId: id,
      url: catalogFullUrlForBasename(legacyThemeIdToBasename(id), base),
      assign: 'manual',
    });
  }

  if (isLegacyThemeId(settings.lightThemeId)) {
    const id = settings.lightThemeId!;
    tasks.push({
      legacyId: id,
      url: catalogFullUrlForBasename(legacyThemeIdToBasename(id), base),
      assign: 'light',
    });
  }

  if (isLegacyThemeId(settings.darkThemeId)) {
    const id = settings.darkThemeId!;
    tasks.push({
      legacyId: id,
      url: catalogFullUrlForBasename(legacyThemeIdToBasename(id), base),
      assign: 'dark',
    });
  }

  if (tasks.length === 0) {
    if (settings.useSystemTheme && isLegacyThemeId(settings.themeId)) {
      partial.themeId = 'light-theme';
    }
    return { ok: true, partial };
  }

  const urlToFetched = new Map<string, FetchOk>();
  const uniqueUrls = [...new Set(tasks.map((t) => t.url))];

  const fetchResults = await Promise.all(uniqueUrls.map((url) => fetchAndCacheTheme(url)));
  const failed = fetchResults.find((r): r is { ok: false; error: string } => !r.ok);
  if (failed) return failed;

  uniqueUrls.forEach((url, i) => {
    const r = fetchResults[i];
    if (r && r.ok) urlToFetched.set(url, r.data);
  });

  tasks.forEach((task) => {
    const data = urlToFetched.get(task.url)!;

    if (task.assign === 'manual') {
      partial.themeRemoteManualFullUrl = task.url;
      partial.themeRemoteManualKind = data.kind;
      partial.themeId = data.kind === 'dark' ? 'dark-theme' : 'light-theme';
    } else if (task.assign === 'light') {
      partial.themeRemoteLightFullUrl = task.url;
      partial.themeRemoteLightKind = data.kind;
      partial.lightThemeId = 'light-theme';
    } else {
      partial.themeRemoteDarkFullUrl = task.url;
      partial.themeRemoteDarkKind = data.kind;
      partial.darkThemeId = 'dark-theme';
    }
  });

  if (settings.useSystemTheme && isLegacyThemeId(settings.themeId)) {
    partial.themeId = 'light-theme';
  }

  const existing: ThemeRemoteFavorite[] = [...(settings.themeRemoteFavorites ?? [])];
  const byUrl = new Map(existing.map((f) => [f.fullUrl, f]));
  tasks.forEach((task) => {
    const data = urlToFetched.get(task.url)!;
    if (!byUrl.has(task.url)) {
      byUrl.set(task.url, {
        fullUrl: task.url,
        displayName: data.displayName,
        basename: data.basename,
        kind: data.kind,
        pinned: true,
      });
    }
  });
  partial.themeRemoteFavorites = [...byUrl.values()];

  return { ok: true, partial };
}
