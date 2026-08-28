import { describe, expect, it, vi } from 'vitest';

vi.mock('./cache', () => ({
  putCachedThemeCss: vi
    .fn<(url: string, cssText: string) => Promise<void>>()
    .mockResolvedValue(undefined),
}));

import { processPastedOrUploadedCss } from './processThemeImport';

describe('processPastedOrUploadedCss', () => {
  it('returns CSS with a locally pasted tweak for settings sync', async () => {
    const cssText = '/*\n@sable-tweak\nname: Pasted\n*/\n.pasted { color: red; }';
    const result = await processPastedOrUploadedCss(cssText);

    expect(result).toMatchObject({
      ok: true,
      role: 'tweak',
      importedLocal: true,
      cssText,
    });
  });
});
