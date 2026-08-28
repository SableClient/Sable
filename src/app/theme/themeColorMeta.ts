const DYNAMIC_ATTR = 'data-sable-dynamic';

// Mirror the current top-bar color into a runtime theme-color meta.
export function updateThemeColorMeta(color: string | undefined): void {
  if (!color) return;

  document.head.querySelectorAll('meta[name="theme-color"]').forEach((node) => {
    if (!node.hasAttribute(DYNAMIC_ATTR)) node.remove();
  });

  let meta = document.head.querySelector<HTMLMetaElement>(
    `meta[name="theme-color"][${DYNAMIC_ATTR}]`
  );
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute(DYNAMIC_ATTR, '');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}
