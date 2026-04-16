import { render, screen } from '@testing-library/react';
import parse from 'html-react-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { buildAbbrReplaceTextNode } from '$components/message/RenderBody';
import { sanitizeCustomHtml } from '$utils/sanitize';
import {
  LINKIFY_OPTS,
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  makeMentionCustomProps,
  renderMatrixMention,
} from './react-custom-html-parser';

const settingsLinkBaseUrl = 'https://app.example';

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

const createMatrixClient = (overrides: Record<string, unknown> = {}) =>
  ({
    getUserId: () => '@alice:example.org',
    getRoom: () => undefined,
    mxcUrlToHttp: () => null,
    ...overrides,
  }) as never;

function renderParsedHtml(
  html: string,
  options: {
    sanitize?: boolean;
    mx?: ReturnType<typeof createMatrixClient>;
  } = {}
) {
  const { sanitize = true, mx = createMatrixClient() } = options;
  const parserOptions = getReactCustomHtmlParser(mx, '!room:example.com', {
    settingsLinkBaseUrl,
    linkifyOpts: LINKIFY_OPTS,
    handleMentionClick: undefined,
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
    expect(container.querySelector('#code-block-content')).toHaveClass(
      customHtmlCss.CodeBlockInternal
    );
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

describe('react custom html parser', () => {
  it('renders same-origin raw settings links as mention-style chips through the factory link render path', () => {
    const renderLink = factoryRenderLinkifyWithMention(
      settingsLinkBaseUrl,
      () => undefined,
      undefined
    ) as (ir: never) => JSX.Element;

    render(
      <div>
        {renderLink({
          tagName: 'a',
          attributes: {
            href: 'https://app.example/settings/appearance?focus=message-link-preview',
          },
          content: 'https://app.example/settings/appearance?focus=message-link-preview',
        } as never)}
      </div>
    );

    const link = screen.getByRole('link', { name: 'Appearance / Message Link Preview' });
    expect(link).toHaveAttribute('data-settings-link-section', 'appearance');
    expect(link).toHaveAttribute('data-settings-link-focus', 'message-link-preview');
    expect(link.className).toContain(customHtmlCss.Mention({}));
    expect(link).not.toHaveTextContent('Settings:');
    expect(link.className).toContain(customHtmlCss.MentionWithIcon);
  });

  it('renders same-origin settings links as internal app links with settings metadata', () => {
    renderParsedHtml(
      '<a href="https://app.example/settings/appearance?focus=message-link-preview">Appearance</a>',
      { sanitize: false }
    );

    const link = screen.getByRole('link', { name: 'Appearance' });
    expect(link).toHaveAttribute(
      'href',
      'https://app.example/settings/appearance?focus=message-link-preview'
    );
    expect(link).toHaveAttribute('data-settings-link-section', 'appearance');
    expect(link).toHaveAttribute('data-settings-link-focus', 'message-link-preview');
    expect(link).not.toHaveAttribute('data-mention-id');
    expect(link.className).toContain(customHtmlCss.Mention({}));
    expect(link.className).toContain(customHtmlCss.MentionWithIcon);
  });

  it('renders matrix message permalinks with an icon instead of the Message prefix', () => {
    render(
      <div>
        {renderMatrixMention(
          createMatrixClient({
            getRoom: () => ({ roomId: '!room:example.org', name: 'Lobby' }),
          }),
          undefined,
          'https://matrix.to/#/!room:example.org/$event123',
          makeMentionCustomProps(undefined)
        )}
      </div>
    );

    const link = screen.getByRole('link', { name: '#Lobby' });
    expect(link).toHaveAttribute('data-mention-id', '!room:example.org');
    expect(link).toHaveAttribute('data-mention-event-id', '$event123');
    expect(link.className).toContain(customHtmlCss.Mention({}));
    expect(link.className).toContain(customHtmlCss.MentionWithIcon);
    expect(link).not.toHaveTextContent('Message:');
    expect(link.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

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
      '<img data-mx-emoticon src="mxc://example.org/emote" alt="blobcat" title="blobcat" height="32" />',
      { sanitize: false }
    );

    expect(screen.getByText(':blobcat:')).toBeInTheDocument();
    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
  });

  it('renders a readable fallback for unresolved non-emote MXC images', () => {
    const { container } = renderParsedHtml(
      '<img src="mxc://example.org/image" alt="media" title="media" />',
      { sanitize: false }
    );

    expect(screen.getByText('media')).toBeInTheDocument();
    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
  });

  it('renders unresolved MXC fallbacks without emitting debug logs', () => {
    const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderParsedHtml('<img src="mxc://example.org/image" alt="media" title="media" />', {
      sanitize: false,
    });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('does not fall back to rendering unsafe non-mxc image urls from unsanitized html', () => {
    const unsafeUrl = ['javascript', 'alert(1)'].join(':');
    const { container } = renderParsedHtml(
      `<img src="${unsafeUrl}" alt="unsafe media" title="unsafe media" />`,
      { sanitize: false }
    );

    expect(screen.getByText('unsafe media')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('linkifies bare urls in formatted html text nodes even when abbreviation replacement runs', () => {
    const parserOptions = getReactCustomHtmlParser(createMatrixClient(), '!room:example.com', {
      settingsLinkBaseUrl,
      linkifyOpts: LINKIFY_OPTS,
      handleMentionClick: undefined,
      replaceTextNode: buildAbbrReplaceTextNode(new Map([['PR', 'Pull request']]), LINKIFY_OPTS),
    });

    render(
      <div>
        {parse(
          '<p>figured out the section could be removed; set up a PR for it: https://github.com/SableClient/Sable/pull/626</p>',
          parserOptions
        )}
      </div>
    );

    expect(screen.getByText('PR')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'https://github.com/SableClient/Sable/pull/626',
      })
    ).toHaveAttribute('href', 'https://github.com/SableClient/Sable/pull/626');
  });

  it('keeps the full link intact when an abbreviation term appears inside the url token', () => {
    const parserOptions = getReactCustomHtmlParser(createMatrixClient(), '!room:example.com', {
      settingsLinkBaseUrl,
      linkifyOpts: LINKIFY_OPTS,
      handleMentionClick: undefined,
      replaceTextNode: buildAbbrReplaceTextNode(new Map([['PR', 'Pull request']]), LINKIFY_OPTS),
    });

    render(
      <div>
        {parse(
          '<p>see https://github.com/SableClient/Sable/pull/PR/626 for context</p>',
          parserOptions
        )}
      </div>
    );

    expect(
      screen.getByRole('link', {
        name: 'https://github.com/SableClient/Sable/pull/PR/626',
      })
    ).toHaveAttribute('href', 'https://github.com/SableClient/Sable/pull/PR/626');
  });
});
