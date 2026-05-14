const PROP_RE = /^\s*(--(?:sable|tc)-[a-zA-Z0-9-]+)\s*:\s*([^;]+?)\s*;?\s*$/;

const DANGEROUS_VALUE = /url\s*\(|@import|expression\s*\(|javascript:|\\0|<!--|--!?>|<script/i;

export const PREVIEW_CARD_SAFE_CUSTOM_PROPERTIES: ReadonlySet<string> = new Set([
  '--sable-bg-container',
  '--sable-bg-on-container',
  '--sable-primary-main',
  '--sable-primary-on-main',
  '--sable-surface-container',
  '--sable-surface-container-line',
  '--sable-surface-on-container',
]);

export function extractSafePreviewCustomProperties(cssText: string): Record<string, string> {
  const noComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars: Record<string, string> = {};
  noComments.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('@')) {
      const m = trimmed.match(PROP_RE);
      if (m && m[1] && m[2]) {
        const name = m[1];
        if (!PREVIEW_CARD_SAFE_CUSTOM_PROPERTIES.has(name)) return;
        const val = m[2].trim();
        if (!DANGEROUS_VALUE.test(val) && val.length <= 2000) {
          vars[name] = val;
        }
      }
    }
  });
  return vars;
}

export function buildPreviewStyleBlock(
  vars: Record<string, string>,
  scopeClass = 'sable-theme-preview'
): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  if (!body) return '';
  return `.${scopeClass} {\n${body}\n}`;
}
