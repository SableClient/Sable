import { parseGithubRawBaseUrl, rawFileUrl, type GithubRawParts } from './githubRaw';

export type GithubContentItem = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
};

export type ThemePair = {
  basename: string;
  previewUrl: string;
  fullUrl: string;
};

export type TweakCatalogEntry = {
  basename: string;
  fullUrl: string;
};

export type ThemeCatalogBundle = {
  themes: ThemePair[];
  tweaks: TweakCatalogEntry[];
};

export type ThemeCatalogManifest = {
  version?: number;
  themes?: ThemePair[];
  tweaks?: TweakCatalogEntry[];
};

export type ListThemeCatalogOptions = {
  manifestUrl?: string | null;
};

const PREVIEW_SUFFIX = '.preview.sable.css';
const FULL_SUFFIX = '.sable.css';

export function themeCatalogManifestUrlFromBase(catalogBaseUrl: string): string | null {
  const trimmed = catalogBaseUrl.trim();
  if (!trimmed) return null;
  const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  try {
    return new URL('catalog.json', base).href;
  } catch {
    return null;
  }
}

function parseThemePairRows(themes: unknown[]): ThemePair[] {
  return themes
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const { basename, previewUrl, fullUrl } = row as Record<string, unknown>;
      if (
        typeof basename !== 'string' ||
        typeof previewUrl !== 'string' ||
        typeof fullUrl !== 'string'
      ) {
        return null;
      }
      if (!basename || !previewUrl || !fullUrl) return null;
      return { basename, previewUrl, fullUrl };
    })
    .filter((pair): pair is ThemePair => pair !== null);
}

function parseTweakRows(tweaks: unknown[]): TweakCatalogEntry[] {
  return tweaks
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const { basename, fullUrl } = row as Record<string, unknown>;
      if (typeof basename !== 'string' || typeof fullUrl !== 'string') return null;
      if (!basename || !fullUrl) return null;
      return { basename, fullUrl };
    })
    .filter((e): e is TweakCatalogEntry => e !== null);
}

async function fetchCatalogBundleFromManifest(
  manifestUrl: string
): Promise<ThemeCatalogBundle | null> {
  const res = await fetch(manifestUrl, { mode: 'cors' });
  if (!res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { themes, tweaks } = data as Record<string, unknown>;
  if (!Array.isArray(themes)) return null;
  const parsedThemes = parseThemePairRows(themes);
  const parsedTweaks = Array.isArray(tweaks) ? parseTweakRows(tweaks) : [];
  return { themes: parsedThemes, tweaks: parsedTweaks };
}

/** Path segments for GET /repos/.../contents/{path} */
function directoryPathToApiSegment(directoryPath: string): string {
  if (!directoryPath) return '';
  return directoryPath
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function fetchGithubContents(parts: GithubRawParts): Promise<GithubContentItem[]> {
  const encoded = directoryPathToApiSegment(parts.directoryPath);
  const pathSeg = encoded ? `/${encoded}` : '';
  const apiUrl = `https://api.github.com/repos/${parts.owner}/${parts.repo}/contents${pathSeg}?ref=${encodeURIComponent(parts.ref)}`;
  const res = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`theme catalog list failed: ${res.status}`);
  }
  const data = (await res.json()) as GithubContentItem | GithubContentItem[];
  return Array.isArray(data) ? data : [data];
}

async function listTweakEntriesFromGithub(parts: GithubRawParts): Promise<TweakCatalogEntry[]> {
  const tweakDir = parts.directoryPath ? `${parts.directoryPath}/tweaks` : 'tweaks';
  let items: GithubContentItem[];
  try {
    items = await fetchGithubContents({ ...parts, directoryPath: tweakDir });
  } catch {
    return [];
  }
  return items
    .filter((i) => i.type === 'file' && i.name.endsWith(FULL_SUFFIX))
    .map((i) => {
      const basename = i.name.slice(0, -FULL_SUFFIX.length);
      return {
        basename,
        fullUrl: i.download_url ?? rawFileUrl({ ...parts, directoryPath: tweakDir }, i.name),
      };
    })
    .filter((e) => Boolean(e.fullUrl));
}

async function listThemePairsFromGithub(parts: GithubRawParts): Promise<ThemePair[]> {
  const themeDir = parts.directoryPath ? `${parts.directoryPath}/themes` : 'themes';
  const dirParts: GithubRawParts = { ...parts, directoryPath: themeDir };
  const items = await fetchGithubContents(dirParts);
  const previewFiles = items.filter((i) => i.type === 'file' && i.name.endsWith(PREVIEW_SUFFIX));
  return previewFiles
    .map((p) => {
      const basename = p.name.slice(0, -PREVIEW_SUFFIX.length);
      const fullName = `${basename}${FULL_SUFFIX}`;
      const full = items.find((i) => i.type === 'file' && i.name === fullName);
      if (!full) return null;
      const previewUrl = p.download_url ?? rawFileUrl(dirParts, p.name);
      const fullUrl = full.download_url ?? rawFileUrl(dirParts, fullName);
      if (!previewUrl || !fullUrl) return null;
      return {
        basename,
        previewUrl,
        fullUrl,
      };
    })
    .filter((pair): pair is ThemePair => pair !== null);
}

export async function fetchThemeCatalogBundle(
  baseUrl: string,
  options?: ListThemeCatalogOptions
): Promise<ThemeCatalogBundle> {
  const manifestUrl =
    options?.manifestUrl?.trim() || themeCatalogManifestUrlFromBase(baseUrl) || undefined;
  if (manifestUrl) {
    const fromManifest = await fetchCatalogBundleFromManifest(manifestUrl);
    if (fromManifest !== null) return fromManifest;
  }

  const parts = parseGithubRawBaseUrl(baseUrl);
  if (!parts) return { themes: [], tweaks: [] };
  const themes = await listThemePairsFromGithub(parts);
  const tweaks = await listTweakEntriesFromGithub(parts);
  return { themes, tweaks };
}

export async function listThemePairsFromCatalog(
  baseUrl: string,
  options?: ListThemeCatalogOptions
): Promise<ThemePair[]> {
  const bundle = await fetchThemeCatalogBundle(baseUrl, options);
  return bundle.themes;
}

export async function listTweakEntriesFromCatalog(
  baseUrl: string,
  options?: ListThemeCatalogOptions
): Promise<TweakCatalogEntry[]> {
  const bundle = await fetchThemeCatalogBundle(baseUrl, options);
  return bundle.tweaks;
}
