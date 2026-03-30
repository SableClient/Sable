import { render, screen } from '@testing-library/react';
import parse from 'html-react-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as css from '$styles/CustomHtml.css';
import { sanitizeCustomHtml } from '$utils/sanitize';
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

function createMatrixClient() {
  return {
    getRoom: () => undefined,
    getUserId: () => '@me:example.com',
    mxcUrlToHttp: () => null,
  } as any;
}

function renderParsedHtml(
  html: string,
  options: {
    sanitize?: boolean;
    mx?: any;
  } = {}
) {
  const { sanitize = true, mx = createMatrixClient() } = options;
  const parserOptions = getReactCustomHtmlParser(mx, '!room:example.com', {
    linkifyOpts: LINKIFY_OPTS,
  });

  return render(<div>{parse(sanitize ? sanitizeCustomHtml(html) : html, parserOptions)}</div>);
}

const renderMessage = (html: string) => renderParsedHtml(html, { sanitize: false });

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('getReactCustomHtmlParser code blocks', () => {
  it('renders the Arborium renderer inside the existing code block shell for explicit data-lang metadata', () => {
    const { container } = renderMessage(
      `<pre>\n  <code data-lang="rust">fn main() {\nlet value = 1;\nlet next = 2;\nlet third = 3;\nlet fourth = 4;\nlet fifth = 5;\nlet sixth = 6;\nlet seventh = 7;\nlet eighth = 8;\nlet ninth = 9;\nlet tenth = 10;\nlet eleventh = 11;\nlet twelfth = 12;\nlet thirteenth = 13;\nlet fourteenth = 14;\nlet fifteenth = 15;\n}</code>\n</pre>`
    );

    expect(screen.getByText('rust')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();

    const arboriumCode = container.querySelector('[data-testid="arborium-code"]');
    expect(arboriumCode).toBeInTheDocument();
    expect(arboriumCode).toHaveTextContent('fn main()');
    expect(arboriumCode).toHaveAttribute('data-language', 'rust');
    expect(arboriumCode).toHaveAttribute('data-allow-detect', 'false');
    expect(container.querySelector('#code-block-content')).toHaveClass(css.CodeBlockInternal);
    expect(CodeHighlightRenderer).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringContaining('let fifteenth = 15;'),
        language: 'rust',
        allowDetect: false,
      }),
      expect.anything()
    );
  });

  it('preserves nested code children instead of routing them through Arborium', () => {
    const { container } = renderMessage(`<pre>\n  <code>alpha<br />beta</code>\n</pre>`);

    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(CodeHighlightRenderer).not.toHaveBeenCalled();
    expect(container.querySelector('br')).toBeInTheDocument();
    expect(container.querySelector('code')).toHaveTextContent('alphabeta');
  });

  it('uses data-lang on the pre element when the nested code element has no metadata', () => {
    renderMessage(`<pre data-lang="rust"><code>fn main() {}</code></pre>`);

    expect(screen.getByText('rust')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();

    const shell = screen.getByTestId('arborium-code');
    expect(shell).toHaveTextContent('fn main() {}');
    expect(shell).toHaveAttribute('data-language', 'rust');
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

describe('getReactCustomHtmlParser', () => {
  it('translates Matrix color data attributes into rendered styles', () => {
    renderParsedHtml('<span data-mx-color="#ff0000" data-mx-bg-color="#00ff00">colored</span>');

    expect(screen.getByText('colored')).toHaveStyle({
      color: 'rgb(255, 0, 0)',
      backgroundColor: 'rgb(0, 255, 0)',
    });
  });

  it('drops incoming style attributes even if unsanitized html reaches the parser', () => {
    renderParsedHtml(
      '<span style="background-color:#00ff00" data-mx-color="#ff0000">styled</span>',
      { sanitize: false }
    );

    const styled = screen.getByText('styled');

    expect(styled).toHaveStyle({
      color: 'rgb(255, 0, 0)',
    });
    expect(styled).not.toHaveStyle({
      backgroundColor: 'rgb(0, 255, 0)',
    });
  });

  it('renders a readable fallback for unresolved legacy emote MXC images', () => {
    const { container } = renderParsedHtml(
      '<img data-mx-emoticon src="mxc://example.org/emote" alt="blobcat" title="blobcat" height="32" />'
    );

    expect(screen.getByText(':blobcat:')).toBeInTheDocument();
    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
  });

  it('renders a readable fallback for unresolved non-emote MXC images', () => {
    const { container } = renderParsedHtml(
      '<img src="mxc://example.org/image" alt="media" title="media" />'
    );

    expect(screen.getByText('media')).toBeInTheDocument();
    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
  });

  it('renders unresolved MXC fallbacks without emitting debug logs', () => {
    const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderParsedHtml('<img src="mxc://example.org/image" alt="media" title="media" />');

    expect(logSpy).not.toHaveBeenCalled();
  });
});
