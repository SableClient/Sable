import { render, screen } from '@testing-library/react';
import parse from 'html-react-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { buildAbbrReplaceTextNode } from '$components/message/RenderBody';
import { isJumboEmojiText } from '$utils/emojiDetection';
import { sanitizeCustomHtml } from '$utils/sanitize';
import {
  LINKIFY_OPTS,
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  makeMentionCustomProps,
  renderMatrixMention,
  scaleSystemEmoji,
} from './react-custom-html-parser';
import { registerMatrixUriProtocol } from './matrix-uri';
import { markdownToHtml } from './markdown/markdownToHtml';

const settingsLinkBaseUrl = 'https://app.example';

// Ensure linkify recognizes `matrix:` URIs in plain text before any tokenization
// happens in this file.
registerMatrixUriProtocol();

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

vi.mock('$hooks/useRenderableMediaUrl', () => ({
  useRenderableMediaUrl: (src: string | undefined) => src,
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

  it('matches newer Unicode emoji for inline scaling and jumbo detection', () => {
    render(<div data-testid="emoji-root">{scaleSystemEmoji('🫩')}</div>);

    expect(screen.getByTestId('emoji-root').querySelector('span')).toBeInTheDocument();
    expect(isJumboEmojiText('🫩')).toBe(true);
  });

  it('renders Wordle-style square emoji with a fixed-width cell wrapper', () => {
    render(<div data-testid="emoji-root">{scaleSystemEmoji('⬛🟨🟩')}</div>);

    const fixedCells = screen
      .getByTestId('emoji-root')
      .querySelectorAll(`span.${customHtmlCss.SystemEmojiFixedCell}`);

    expect(fixedCells).toHaveLength(3);
  });

  it('does not force regular emoji into a fixed-width cell', () => {
    render(<div data-testid="emoji-root">{scaleSystemEmoji('🤔')}</div>);

    const fixedCells = screen
      .getByTestId('emoji-root')
      .querySelectorAll(`span.${customHtmlCss.SystemEmojiFixedCell}`);

    expect(fixedCells).toHaveLength(0);
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

  it.each(['🫩', '🫪', '🫯', '🇩🇪', '🙂‍↔️'])(
    'wraps modern emoji text %s in emoticon markup',
    (emoji) => {
      const result = scaleSystemEmoji(emoji);
      expect(result).toHaveLength(1);
      expect(typeof result[0]).not.toBe('string');
    }
  );

  it('does not wrap emojis inside urls', () => {
    expect(scaleSystemEmoji('https://example.com/🫩')).toEqual(['https://example.com/🫩']);
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

  it.each([String.raw`\<test\>`, String.raw`\<test>`])(
    'renders %s as literal angle brackets, not entity text',
    (md) => {
      renderParsedHtml(markdownToHtml(md));

      expect(screen.getByText('<test>')).toBeInTheDocument();
      expect(screen.queryByText('&lt;test&gt;')).not.toBeInTheDocument();
    }
  );

  it('unwraps paragraph tags inside list items instead of rendering block breaks', () => {
    const { container } = renderMessage(
      '<ol><li><p>one</p></li><li><p>two</p></li></ol><ul><li><p>bullet</p></li></ul>'
    );

    expect(container.querySelector('p')).toBeNull();
    expect(container.textContent).toContain('one');
    expect(container.textContent).toContain('two');
    expect(container.textContent).toContain('bullet');
  });

  it('preserves literal blank lines inside parsed paragraphs', () => {
    const { container } = renderMessage('<p>first line\n\nsecond line</p>');

    const paragraph = container.querySelector('p');
    expect(paragraph).toBeInTheDocument();
    expect(paragraph).toHaveClass(customHtmlCss.Paragraph);
  });
});

describe('matrix: URI mentions', () => {
  const roomMx = () =>
    createMatrixClient({
      getRoom: () => ({ roomId: '!room:example.org', name: 'Lobby' }),
      getRooms: () => [],
    });

  it('renders a matrix: user URI in an html anchor as a mention pill', () => {
    renderParsedHtml('<a href="matrix:u/bob:example.org">bob</a>', { sanitize: false });

    const link = screen.getByRole('link', { name: '@bob' });
    expect(link).toHaveAttribute('data-mention-id', '@bob:example.org');
    expect(link.className).toContain(customHtmlCss.Mention({}));
  });

  it('keeps valid matrix: URIs through sanitization and renders them as mentions', () => {
    renderParsedHtml('<a href="matrix:u/bob:example.org">bob</a>', { sanitize: true });

    expect(screen.getByRole('link', { name: '@bob' })).toHaveAttribute(
      'data-mention-id',
      '@bob:example.org'
    );
  });

  it('renders a matrix: room URI with via servers and falls back to the room name', () => {
    renderParsedHtml(
      '<a href="matrix:roomid/room:example.org?via=elsewhere.ca">matrix:roomid/room:example.org?via=elsewhere.ca</a>',
      { sanitize: false, mx: roomMx() }
    );

    const link = screen.getByRole('link', { name: '#Lobby' });
    expect(link).toHaveAttribute('data-mention-id', '!room:example.org');
    expect(link).toHaveAttribute('data-mention-via', 'elsewhere.ca');
  });

  it('renders a matrix: event URI with the event id and message icon', () => {
    renderParsedHtml('<a href="matrix:roomid/room:example.org/e/event123">see this</a>', {
      sanitize: false,
      mx: roomMx(),
    });

    const link = screen.getByRole('link', { name: 'see this' });
    expect(link).toHaveAttribute('data-mention-id', '!room:example.org');
    expect(link).toHaveAttribute('data-mention-event-id', '$event123');
    expect(link.className).toContain(customHtmlCss.MentionWithIcon);
  });

  it('autolinks bare matrix: URIs in plain text as mention pills', () => {
    const mx = roomMx();
    const linkifyOpts = {
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention(
        settingsLinkBaseUrl,
        (href) =>
          renderMatrixMention(mx, '!room:example.com', href, makeMentionCustomProps(undefined)),
        undefined
      ),
    };
    const parserOptions = getReactCustomHtmlParser(mx, '!room:example.com', {
      settingsLinkBaseUrl,
      linkifyOpts,
      handleMentionClick: undefined,
    });

    render(<div>{parse('<p>see matrix:r/room:example.org now</p>', parserOptions)}</div>);

    const link = screen.getByRole('link', { name: '#Lobby' });
    expect(link).toHaveAttribute('data-mention-id', '!room:example.org');
  });
});
