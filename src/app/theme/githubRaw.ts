/**
 * Parse a raw.githubusercontent.com base URL into API parameters.
 * E.g. https://raw.githubusercontent.com/SableClient/themes/main/themes/
 */
export type GithubRawParts = {
  owner: string;
  repo: string;
  ref: string;
  directoryPath: string;
};

const RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(?:\/(.*))?$/;

export function parseGithubRawBaseUrl(baseUrl: string): GithubRawParts | null {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const m = trimmed.match(RAW_RE);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const owner = m[1];
  const repo = m[2];
  const ref = m[3];
  const rest = m[4];
  const directoryPath = (rest ?? '').replace(/^\/+|\/+$/g, '');
  return { owner, repo, ref, directoryPath };
}

export function rawFileUrl(parts: GithubRawParts, fileName: string): string {
  const dir = parts.directoryPath ? `${parts.directoryPath}/` : '';
  return `https://raw.githubusercontent.com/${parts.owner}/${parts.repo}/${parts.ref}/${dir}${fileName}`;
}
