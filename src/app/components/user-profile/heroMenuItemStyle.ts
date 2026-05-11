import type { CSSProperties } from 'react';

export function heroMenuItemStyle(
  base: CSSProperties,
  chipHoverBrightness?: number
): CSSProperties {
  const bg = base.backgroundColor;
  const out: CSSProperties = { ...base };
  if (typeof bg === 'string' && bg !== '' && bg !== 'transparent') {
    (out as CSSProperties & { '--user-hero-menu-item-bg': string })['--user-hero-menu-item-bg'] =
      bg;
  }
  if (chipHoverBrightness != null) {
    (out as CSSProperties & { '--user-hero-chip-hover-brightness': number })[
      '--user-hero-chip-hover-brightness'
    ] = chipHoverBrightness;
  }
  return out;
}
