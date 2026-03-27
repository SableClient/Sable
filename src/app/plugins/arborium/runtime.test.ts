import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@arborium/arborium');

describe('highlightCode', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('returns escaped code when Arborium cannot be loaded', async () => {
    vi.doMock('@arborium/arborium', () => {
      throw new Error('boom');
    });

    const { highlightCode } = await import('.');

    await expect(
      highlightCode({
        code: '<span class="x">hi</span>',
        language: 'typescript',
      })
    ).resolves.toBe('&lt;span class=&quot;x&quot;&gt;hi&lt;/span&gt;');
  });

  it('delegates to Arborium highlight when the module loads', async () => {
    const highlight = vi.fn(
      async (language: string, code: string) => `<pre data-language="${language}">${code}</pre>`
    );

    vi.doMock('@arborium/arborium', () => ({
      highlight,
    }));

    const { highlightCode } = await import('.');

    await expect(
      highlightCode({
        code: 'const value = 1;',
        language: 'typescript',
      })
    ).resolves.toBe('<pre data-language="typescript">const value = 1;</pre>');
    expect(highlight).toHaveBeenCalledWith('typescript', 'const value = 1;');
  });
});
