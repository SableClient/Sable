export function isThirdPartyThemeUrl(
  url: string,
  approvedHostPrefixes: string[] | undefined
): boolean {
  if (!/^https:\/\//i.test(url.trim())) return false;
  if (!approvedHostPrefixes || approvedHostPrefixes.length === 0) return false;
  return !approvedHostPrefixes.some((p) => url.startsWith(p));
}
