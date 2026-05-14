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
  CodeHighlightRenderer: vi.fn<
    (props: { code: string; language?: string; allowDetect?: boolean }) => JSX.Element
  >(({ code, language, allowDetect }) => (
    <code
      data-testid="arborium-code"
      data-language={language}
      data-allow-detect={String(Boolean(allowDetect))}
    >
      {code}
    </code>
  )),
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
  it('defaults custom emoji img height to 32 when missing', () => {
    const { container } = renderParsedHtml(
      '<img data-mx-emoticon src="mxc://example.org/emote" alt="blobcat" title="blobcat" />',
      {
        sanitize: false,
        mx: createMatrixClient({
          mxcUrlToHttp: () => 'https://cdn.example/emote.png',
        }),
      }
    );

    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('height', '32');
  });

  it('clamps incoming inline image height to the configured max', () => {
    const { container } = renderParsedHtml(
      '<img data-mx-emoticon src="mxc://example.org/emote" alt="blobcat" title="blobcat" height="128" />',
      {
        sanitize: false,
        mx: createMatrixClient({
          mxcUrlToHttp: () => 'https://cdn.example/emote.png',
        }),
      }
    );

    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    // Default max is 64 unless overridden by settings.
    expect(img).toHaveAttribute('height', '64');
  });

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
            href: 'https://app.example/settings/appearance?focus=message-link-preview&moe.sable.client.action=settings',
          },
          content:
            'https://app.example/settings/appearance?focus=message-link-preview&moe.sable.client.action=settings',
        } as never)}
      </div>
    );

    const link = screen.getByRole('link', { name: 'Appearance / Message Link Preview' });
    expect(link).toHaveAttribute('data-settings-link-section', 'appearance');
    expect(link).toHaveAttribute('data-settings-link-focus', 'message-link-preview');
    expect(link.className).toContain(customHtmlCss.Mention({}));
    expect(link).not.toHaveTextContent('Settings >');
    expect(link.className).toContain(customHtmlCss.MentionWithIcon);
  });

  it('renders same-origin settings links as internal app links with settings metadata', () => {
    renderParsedHtml(
      '<a href="https://app.example/settings/appearance?focus=message-link-preview&amp;moe.sable.client.action=settings">Appearance</a>',
      { sanitize: false }
    );

    const link = screen.getByRole('link', { name: 'Appearance / Message Link Preview' });
    expect(link).toHaveAttribute(
      'href',
      'https://app.example/settings/appearance?focus=message-link-preview&moe.sable.client.action=settings'
    );
    expect(link).toHaveAttribute('data-settings-link-section', 'appearance');
    expect(link).toHaveAttribute('data-settings-link-focus', 'message-link-preview');
    expect(link).not.toHaveAttribute('data-mention-id');
    expect(link.className).toContain(customHtmlCss.Mention({}));
    expect(link.className).toContain(customHtmlCss.MentionWithIcon);
  });

  it('renders marked cross-instance settings links as internal app links with settings metadata', () => {
    renderParsedHtml(
      '<a href="https://other.example/#/client/settings/account?focus=status&amp;moe.sable.client.action=settings">Account</a>',
      { sanitize: false }
    );

    const link = screen.getByRole('link', { name: 'Account / Status' });
    expect(link).toHaveAttribute(
      'href',
      'https://other.example/#/client/settings/account?focus=status&moe.sable.client.action=settings'
    );
    expect(link).toHaveAttribute('data-settings-link-section', 'account');
    expect(link).toHaveAttribute('data-settings-link-focus', 'status');
  });

  it('keeps malformed settings-looking linkified tokens as normal links', () => {
    const renderLink = factoryRenderLinkifyWithMention(
      settingsLinkBaseUrl,
      () => undefined,
      undefined
    ) as (ir: never) => JSX.Element;
    const malformedToken =
      'https://app.example/settings/account?focus=status&moe.sable.client.action=settings">Settings';

    render(
      <div>
        {renderLink({
          tagName: 'a',
          attributes: {
            href: malformedToken,
          },
          content: malformedToken,
        } as never)}
      </div>
    );

    const link = screen.getByRole('link', { name: malformedToken });
    expect(link).not.toHaveAttribute('data-settings-link-section');
    expect(link).not.toHaveAttribute('data-settings-link-focus');
    expect(link.className).not.toContain(customHtmlCss.MentionWithIcon);
  });

  it('keeps settings links with unknown focus ids as normal links', () => {
    renderParsedHtml(
      '<a href="https://app.example/settings/account?focus=display-name2">Settings &gt; Account &gt; Display Name2</a>',
      { sanitize: false }
    );

    const link = screen.getByRole('link', { name: 'Settings > Account > Display Name2' });
    expect(link).toHaveAttribute(
      'href',
      'https://app.example/settings/account?focus=display-name2'
    );
    expect(link).not.toHaveAttribute('data-settings-link-section');
    expect(link).not.toHaveAttribute('data-settings-link-focus');
    expect(link.className).not.toContain(customHtmlCss.MentionWithIcon);
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

  it('uses room name when formatted body uses the full matrix.to URL as link text', () => {
    const url = 'https://matrix.to/#/!room:example.org';
    const mx = createMatrixClient({
      getRoom: (id: string) =>
        id === '!room:example.org' ? { roomId: '!room:example.org', name: 'Lobby' } : undefined,
    });
    renderParsedHtml(`<a href="${url}">${url}</a>`, { sanitize: false, mx });

    expect(screen.getByRole('link', { name: '#Lobby' })).toHaveAttribute('href', url);
  });

  it('uses message snippet for event permalinks when the event is in the store', () => {
    const url = 'https://matrix.to/#/!room:example.org/$eventABC';
    const mx = createMatrixClient({
      getRoom: () => ({
        roomId: '!room:example.org',
        name: 'Lobby',
        findEventById: (id: string) =>
          id === '$eventABC'
            ? {
                getContent: () => ({
                  body: `${'Hello world '.repeat(12)}tail`,
                }),
              }
            : null,
      }),
    });
    renderParsedHtml(`<a href="${url}">${url}</a>`, { sanitize: false, mx });

    const link = screen.getByRole('link', { name: /#Lobby: Hello world/ });
    expect(link).toHaveAttribute('data-mention-event-id', '$eventABC');
    expect(link.textContent).toMatch(/…/);
  });

  it('keeps custom link text when it is not just the permalink URL', () => {
    const url = 'https://matrix.to/#/!room:example.org/$event123';
    const mx = createMatrixClient({
      getRoom: () => ({ roomId: '!room:example.org', name: 'Lobby' }),
    });
    renderParsedHtml(`<a href="${url}">see this thread</a>`, { sanitize: false, mx });

    expect(screen.getByRole('link', { name: 'see this thread' })).toBeInTheDocument();
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
    const logSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn<() => void>());

    renderParsedHtml('<img src="mxc://example.org/image" alt="media" title="media" />', {
      sanitize: false,
    });

    expect(logSpy).not.toHaveBeenCalled();
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
