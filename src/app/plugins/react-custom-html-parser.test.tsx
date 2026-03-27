import { render, screen } from '@testing-library/react';
import parse from 'html-react-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getReactCustomHtmlParser, LINKIFY_OPTS } from './react-custom-html-parser';

const { CodeHighlightRenderer } = vi.hoisted(() => ({
  CodeHighlightRenderer: vi.fn(
    ({
      code,
      language,
      allowDetect,
    }: {
      code: string;
      language?: string;
      allowDetect?: boolean;
    }) => (
      <code
        data-testid="arborium-code"
        data-language={language}
        data-allow-detect={String(Boolean(allowDetect))}
      >
        {code}
      </code>
    )
  ),
}));

vi.mock('$components/code-highlight', () => ({
  CodeHighlightRenderer,
}));

afterEach(() => {
  vi.clearAllMocks();
});

const mx = {} as never;

const renderMessage = (html: string) =>
  render(
    <>
      {parse(
        html,
        getReactCustomHtmlParser(mx, undefined, {
          linkifyOpts: LINKIFY_OPTS,
        })
      )}
    </>
  );

describe('getReactCustomHtmlParser code blocks', () => {
  it('renders the Arborium renderer inside the existing code block shell for explicit data-lang metadata', () => {
    renderMessage(
      `<pre>\n  <code data-lang="rust">fn main() {\nlet value = 1;\nlet next = 2;\nlet third = 3;\nlet fourth = 4;\nlet fifth = 5;\nlet sixth = 6;\nlet seventh = 7;\nlet eighth = 8;\nlet ninth = 9;\nlet tenth = 10;\nlet eleventh = 11;\nlet twelfth = 12;\nlet thirteenth = 13;\nlet fourteenth = 14;\nlet fifteenth = 15;\n}</code>\n</pre>`
    );

    expect(screen.getByText('rust')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();

    const arboriumCode = screen.getByTestId('arborium-code');
    expect(arboriumCode).toHaveTextContent('fn main()');
    expect(arboriumCode).toHaveAttribute('data-language', 'rust');
    expect(arboriumCode).toHaveAttribute('data-allow-detect', 'false');
    expect(CodeHighlightRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringContaining('let fifteenth = 15;'),
        language: 'rust',
        allowDetect: false,
      }),
      expect.anything()
    );
  });

  it('falls back to the language class when no explicit data-lang metadata is present', () => {
    renderMessage(
      `<pre><code class="language-ts">const value = 1;\nconsole.log(value);</code></pre>`
    );

    expect(screen.getByText('ts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();

    const shell = screen.getByTestId('arborium-code');
    expect(shell).toHaveTextContent('const value = 1;');
    expect(shell).toHaveAttribute('data-language', 'ts');
  });
});
