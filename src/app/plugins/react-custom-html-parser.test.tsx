import { render, screen } from '@testing-library/react';
import parse from 'html-react-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { sanitizeCustomHtml } from '$utils/sanitize';
import {
  LINKIFY_OPTS,
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  makeMentionCustomProps,
  renderMatrixMention,
} from './react-custom-html-parser';

const settingsLinkBaseUrl = 'https://app.example';

const createMatrixClient = (overrides: Record<string, unknown> = {}) =>
  ({
    getUserId: () => '@alice:example.org',
    getRoom: () => undefined,
    mxcUrlToHttp: () => null,
    ...overrides,
  }) as never;

function Subject({
  body,
  sanitize = false,
  mx = createMatrixClient(),
}: {
  body: string;
  sanitize?: boolean;
  mx?: ReturnType<typeof createMatrixClient>;
}) {
  const options = getReactCustomHtmlParser(mx, undefined, {
    settingsLinkBaseUrl,
    linkifyOpts: LINKIFY_OPTS,
    handleMentionClick: undefined,
  });

  return <div>{parse(sanitize ? sanitizeCustomHtml(body) : body, options)}</div>;
}

describe('react custom html parser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    render(
      <Subject body='<a href="https://app.example/settings/appearance?focus=message-link-preview">Appearance</a>' />
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
    render(
      <Subject
        sanitize
        body='<span data-mx-color="#ff0000" data-mx-bg-color="#00ff00">colored</span>'
      />
    );

    expect(screen.getByText('colored')).toHaveStyle({
      color: 'rgb(255, 0, 0)',
      backgroundColor: 'rgb(0, 255, 0)',
    });
  });

  it('drops incoming style attributes even if unsanitized html reaches the parser', () => {
    render(
      <Subject body='<span style="background-color:#00ff00" data-mx-color="#ff0000">styled</span>' />
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
    const { container } = render(
      <Subject body='<img data-mx-emoticon src="mxc://example.org/emote" alt="blobcat" title="blobcat" height="32" />' />
    );

    expect(screen.getByText(':blobcat:')).toBeInTheDocument();
    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
  });

  it('renders a readable fallback for unresolved non-emote MXC images', () => {
    const { container } = render(
      <Subject body='<img src="mxc://example.org/image" alt="media" title="media" />' />
    );

    expect(screen.getByText('media')).toBeInTheDocument();
    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
  });

  it('renders unresolved MXC fallbacks without emitting debug logs', () => {
    const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<Subject body='<img src="mxc://example.org/image" alt="media" title="media" />' />);

    expect(logSpy).not.toHaveBeenCalled();
  });
});
