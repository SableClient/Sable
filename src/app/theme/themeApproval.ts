/** When listed in themeCatalogApprovedHostPrefixes, HTTPS theme/tweak CDN URLs match all origins (trust model: same as any remote CSS). */
export const APPROVED_THEME_PREFIX_ALLOW_ALL = '*';

function trimmedPrefixes(prefixes: string[] | undefined): readonly string[] {
  if (!prefixes?.length) return [];
  return prefixes.map((p) => p.trim()).filter(Boolean);
}

/**
 * HTTPS URLs permitted as "catalog-official" for badges and banners.
 * - Undefined or empty ⇒ none (every matching URL is unofficial / third-party for UI).
 * - Include {@link APPROVED_THEME_PREFIX_ALLOW_ALL} ⇒ any https URL counts as permitted.
 */
export function isApprovedCatalogHostUrl(
  url: string,
  approvedHostPrefixes: string[] | undefined
): boolean {
  const u = url.trim();
  if (!/^https:\/\//i.test(u)) return false;
  const list = trimmedPrefixes(approvedHostPrefixes);
  if (list.length === 0) return false;
  if (list.some((p) => p === APPROVED_THEME_PREFIX_ALLOW_ALL)) return true;
  return list.some((p) => u.startsWith(p));
}

/** True when the URL is https and does not satisfy {@link isApprovedCatalogHostUrl}. */
export function isThirdPartyThemeUrl(
  url: string,
  approvedHostPrefixes: string[] | undefined
): boolean {
  const u = url.trim();
  if (!/^https:\/\//i.test(u)) return false;
  return !isApprovedCatalogHostUrl(u, approvedHostPrefixes);
}
