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

const PREVIEW_SUFFIX = '.preview.sable.css';
const FULL_SUFFIX = '.sable.css';

export async function listThemePairsFromCatalog(baseUrl: string): Promise<ThemePair[]> {
  const parts = parseGithubRawBaseUrl(baseUrl);
  if (!parts) return [];
  const items = await fetchGithubContents(parts);
  const previewFiles = items.filter(
    (i) => i.type === 'file' && i.name.endsWith(PREVIEW_SUFFIX)
  );
  const pairs: ThemePair[] = [];
  for (const p of previewFiles) {
    const basename = p.name.slice(0, -PREVIEW_SUFFIX.length);
    const fullName = `${basename}${FULL_SUFFIX}`;
    const full = items.find((i) => i.type === 'file' && i.name === fullName);
    if (!full?.download_url) continue;
    pairs.push({
      basename,
      previewUrl: rawFileUrl(parts, p.name),
      fullUrl: full.download_url,
    });
  }
  return pairs;
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
