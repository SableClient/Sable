import { afterEach, describe, expect, it } from 'vitest';
import { updateThemeColorMeta } from './themeColorMeta';

const themeColorMetas = () =>
  Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));

const onlyMeta = (): HTMLMetaElement => {
  const metas = themeColorMetas();
  expect(metas).toHaveLength(1);
  return metas[0]!;
};

afterEach(() => {
  themeColorMetas().forEach((node) => node.remove());
});

describe('updateThemeColorMeta', () => {
  it('replaces static theme-color tags with a single dynamic tag', () => {
    const staticLight = document.createElement('meta');
    staticLight.setAttribute('name', 'theme-color');
    staticLight.setAttribute('media', '(prefers-color-scheme: light)');
    staticLight.setAttribute('content', '#ffffff');
    document.head.appendChild(staticLight);

    updateThemeColorMeta('rgb(18, 52, 86)');

    const meta = onlyMeta();
    expect(meta.hasAttribute('media')).toBe(false);
    expect(meta.getAttribute('content')).toBe('rgb(18, 52, 86)');
  });

  it('reuses the dynamic tag on later changes', () => {
    updateThemeColorMeta('#111111');
    updateThemeColorMeta('#222222');

    expect(onlyMeta().getAttribute('content')).toBe('#222222');
  });

  it('leaves existing tags untouched when no color is given', () => {
    const staticDark = document.createElement('meta');
    staticDark.setAttribute('name', 'theme-color');
    staticDark.setAttribute('content', '#1b1a21');
    document.head.appendChild(staticDark);

    updateThemeColorMeta(undefined);

    expect(onlyMeta().getAttribute('content')).toBe('#1b1a21');
  });
});
