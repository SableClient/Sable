import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HighlightCodeInput, HighlightResult } from '.';

type ArboriumModule =
  NonNullable<HighlightCodeInput['loadModule']> extends () => Promise<infer T> ? T : never;

afterEach(() => {
  vi.resetModules();
});

describe('highlightCode', () => {
  it('normalizes explicit aliases before highlighting', async () => {
    const normalizeLanguage = vi.fn((language: string) =>
      language === 'ts' ? 'typescript' : language
    );
    const detectLanguage = vi.fn(() => null);
    const highlight = vi.fn(
      async (language: string, code: string) => `<pre data-language="${language}">${code}</pre>`
    );
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
    } as unknown as ArboriumModule;
    const loadModule = vi.fn(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode({
      code: 'const value = 1;',
      language: 'ts',
      allowDetect: false,
      loadModule,
    });

    expect(result).toEqual({
      mode: 'highlighted',
      html: '<pre data-language="typescript">const value = 1;</pre>',
      language: 'typescript',
    });
    expect(normalizeLanguage).toHaveBeenCalledWith('ts');
    expect(detectLanguage).not.toHaveBeenCalled();
    expect(highlight).toHaveBeenCalledWith('typescript', 'const value = 1;');
  });

  it('does not detect a language when allowDetect is false', async () => {
    const normalizeLanguage = vi.fn((language: string) => language);
    const detectLanguage = vi.fn(() => 'javascript');
    const highlight = vi.fn(async () => '<pre></pre>');
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
    } as unknown as ArboriumModule;
    const loadModule = vi.fn(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode({
      code: '<b>hello</b>',
      allowDetect: false,
      loadModule,
    });

    expect(result).toEqual({
      mode: 'plain',
      html: '&lt;b&gt;hello&lt;/b&gt;',
      language: null,
    });
    expect(normalizeLanguage).not.toHaveBeenCalled();
    expect(detectLanguage).not.toHaveBeenCalled();
    expect(highlight).not.toHaveBeenCalled();
  });

  it('detects a language only when allowDetect is true', async () => {
    const normalizeLanguage = vi.fn((language: string) =>
      language === 'js' ? 'javascript' : language
    );
    const detectLanguage = vi.fn(() => 'js');
    const highlight = vi.fn(
      async (language: string, code: string) => `<pre data-language="${language}">${code}</pre>`
    );
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
    } as unknown as ArboriumModule;
    const loadModule = vi.fn(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode({
      code: 'const value = 1;',
      allowDetect: true,
      loadModule,
    });

    expect(result).toEqual({
      mode: 'highlighted',
      html: '<pre data-language="javascript">const value = 1;</pre>',
      language: 'javascript',
    });
    expect(normalizeLanguage).toHaveBeenCalledWith('js');
    expect(detectLanguage).toHaveBeenCalledWith('const value = 1;');
    expect(highlight).toHaveBeenCalledWith('javascript', 'const value = 1;');
  });

  it('returns plain escaped code when Arborium fails to load', async () => {
    const loadModule = vi.fn(async () => {
      throw new Error('boom');
    });

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode({
      code: '<span class="x">hi</span>',
      language: 'typescript',
      allowDetect: false,
      loadModule,
    });

    expect(result).toEqual({
      mode: 'plain',
      html: '&lt;span class=&quot;x&quot;&gt;hi&lt;/span&gt;',
      language: null,
    });
  });
});
