import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Arborium from '@arborium/arborium';

import type { HighlightResult } from '.';

type ArboriumModule = typeof Arborium;

afterEach(() => {
  vi.resetModules();
});

describe('highlightCode', () => {
  it('normalizes explicit aliases before highlighting', async () => {
    const normalizeLanguage = vi.fn<(language: string) => string>((language: string) =>
      language === 'ts' ? 'typescript' : language
    );
    const detectLanguage = vi.fn<() => null>();
    const highlight = vi.fn<(language: string, code: string) => Promise<string>>(
      async (language: string, code: string) => `<pre data-language="${language}">${code}</pre>`
    );
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
    } as unknown as ArboriumModule;
    const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode(
      {
        code: 'const value = 1;',
        language: 'ts',
        allowDetect: false,
      },
      { loadModule }
    );

    expect(result).toEqual({
      mode: 'highlighted',
      html: '<pre data-language="typescript">const value = 1;</pre>',
      language: 'typescript',
    });
    expect(normalizeLanguage).toHaveBeenCalledWith('ts');
    expect(detectLanguage).not.toHaveBeenCalled();
    expect(highlight).toHaveBeenCalledWith('typescript', 'const value = 1;');
  });

  it('maps jsx to tsx when Arborium supports tsx', async () => {
    const normalizeLanguage = vi.fn<(language: string) => string>((language: string) => language);
    const detectLanguage = vi.fn<() => null>();
    const highlight = vi.fn<(language: string, code: string) => Promise<string>>(
      async (language: string, code: string) => `<pre data-language="${language}">${code}</pre>`
    );
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
      availableLanguages: ['tsx', 'html'],
    } as unknown as ArboriumModule;
    const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode(
      {
        code: '<div />',
        language: 'jsx',
        allowDetect: false,
      },
      { loadModule }
    );

    expect(result).toEqual({
      mode: 'highlighted',
      html: '<pre data-language="tsx"><div /></pre>',
      language: 'tsx',
    });
    expect(normalizeLanguage).toHaveBeenCalledWith('tsx');
    expect(detectLanguage).not.toHaveBeenCalled();
    expect(highlight).toHaveBeenCalledWith('tsx', '<div />');
  });

  it('maps markup to html when Arborium supports html', async () => {
    const normalizeLanguage = vi.fn<(language: string) => string>((language: string) => language);
    const detectLanguage = vi.fn<() => null>();
    const highlight = vi.fn<(language: string, code: string) => Promise<string>>(
      async (language: string, code: string) => `<pre data-language="${language}">${code}</pre>`
    );
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
      availableLanguages: ['tsx', 'html'],
    } as unknown as ArboriumModule;
    const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode(
      {
        code: '<p>hello</p>',
        language: 'markup',
        allowDetect: false,
      },
      { loadModule }
    );

    expect(result).toEqual({
      mode: 'highlighted',
      html: '<pre data-language="html"><p>hello</p></pre>',
      language: 'html',
    });
    expect(normalizeLanguage).toHaveBeenCalledWith('html');
    expect(detectLanguage).not.toHaveBeenCalled();
    expect(highlight).toHaveBeenCalledWith('html', '<p>hello</p>');
  });

  it.each(['txt', 'plaintext', 'plain', 'text', 'log', 'csv', 'makefile', 'make'])(
    'returns plain fallback for %s when Arborium reports it unavailable',
    async (language) => {
      const normalizeLanguage = vi.fn<(nextLanguage: string) => string>((nextLanguage: string) => {
        if (nextLanguage === 'txt' || nextLanguage === 'plaintext' || nextLanguage === 'plain') {
          return 'text';
        }
        if (nextLanguage === 'makefile') {
          return 'make';
        }
        return nextLanguage;
      });
      const detectLanguage = vi.fn<() => null>();
      const highlight = vi.fn<() => Promise<string>>(
        async () => '<pre data-language="unexpected"></pre>'
      );
      const isLanguageAvailable = vi.fn<(nextLanguage: string) => Promise<boolean>>(
        async (nextLanguage: string) => !['text', 'log', 'csv', 'make'].includes(nextLanguage)
      );
      const module = {
        normalizeLanguage,
        detectLanguage,
        highlight,
        isLanguageAvailable,
      } as unknown as ArboriumModule;
      const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => module);

      const { highlightCode } = await import('.');

      const result: HighlightResult = await highlightCode(
        {
          code: 'hello, world',
          language,
          allowDetect: false,
        },
        { loadModule }
      );

      expect(result).toEqual({
        mode: 'plain',
        html: 'hello, world',
        language,
      });
      expect(loadModule).toHaveBeenCalledOnce();
      expect(normalizeLanguage).toHaveBeenCalledWith(language);
      expect(highlight).not.toHaveBeenCalled();
    }
  );

  it('does not detect a language when allowDetect is false', async () => {
    const normalizeLanguage = vi.fn<(language: string) => string>((language: string) => language);
    const detectLanguage = vi.fn<() => string>();
    const highlight = vi.fn<() => Promise<string>>(async () => '<pre></pre>');
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
    } as unknown as ArboriumModule;
    const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode(
      {
        code: '<b>hello</b>',
        allowDetect: false,
      },
      { loadModule }
    );

    expect(result).toEqual({
      mode: 'plain',
      html: '&lt;b&gt;hello&lt;/b&gt;',
    });
    expect(result.language).toBeUndefined();
    expect(normalizeLanguage).not.toHaveBeenCalled();
    expect(detectLanguage).not.toHaveBeenCalled();
    expect(highlight).not.toHaveBeenCalled();
  });

  it('detects a language only when allowDetect is true', async () => {
    const normalizeLanguage = vi.fn<(language: string) => string>((language: string) =>
      language === 'js' ? 'javascript' : language
    );
    const detectLanguage = vi.fn<() => string>(() => 'js');
    const highlight = vi.fn<(language: string, code: string) => Promise<string>>(
      async (language: string, code: string) => `<pre data-language="${language}">${code}</pre>`
    );
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
    } as unknown as ArboriumModule;
    const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode(
      {
        code: 'const value = 1;',
        allowDetect: true,
      },
      { loadModule }
    );

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
    const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => {
      throw new Error('boom');
    });

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode(
      {
        code: '<span class="x">hi</span>',
        language: 'typescript',
        allowDetect: false,
      },
      { loadModule }
    );

    expect(result).toEqual({
      mode: 'plain',
      html: '&lt;span class=&quot;x&quot;&gt;hi&lt;/span&gt;',
      language: 'typescript',
    });
  });

  it('treats escaped Arborium output as plain fallback', async () => {
    const normalizeLanguage = vi.fn<(language: string) => string>((language: string) => language);
    const detectLanguage = vi.fn<() => null>();
    const highlight = vi.fn<() => Promise<string>>(async () => '&lt;span&gt;');
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
    } as unknown as ArboriumModule;
    const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode(
      {
        code: '<span>',
        language: 'typescript',
      },
      { loadModule }
    );

    expect(result).toEqual({
      mode: 'plain',
      html: '&lt;span&gt;',
      language: 'typescript',
    });
    expect(highlight).toHaveBeenCalledWith('typescript', '<span>');
  });

  it('returns plain escaped code with the resolved language when highlighting fails', async () => {
    const normalizeLanguage = vi.fn<(language: string) => string>((language: string) =>
      language === 'ts' ? 'typescript' : language
    );
    const detectLanguage = vi.fn<() => null>();
    const highlight = vi.fn<() => Promise<string>>(async () => {
      throw new Error('bad highlight');
    });
    const module = {
      normalizeLanguage,
      detectLanguage,
      highlight,
    } as unknown as ArboriumModule;
    const loadModule = vi.fn<() => Promise<ArboriumModule>>(async () => module);

    const { highlightCode } = await import('.');

    const result: HighlightResult = await highlightCode(
      {
        code: '<span>',
        language: 'ts',
      },
      { loadModule }
    );

    expect(result).toEqual({
      mode: 'plain',
      html: '&lt;span&gt;',
      language: 'typescript',
    });
    expect(highlight).toHaveBeenCalledWith('typescript', '<span>');
  });
});
