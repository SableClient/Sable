import { render, screen } from '@testing-library/react';
import parse from 'html-react-parser';
import { describe, expect, it } from 'vitest';
import * as customHtmlCss from '$styles/CustomHtml.css';
import {
  LINKIFY_OPTS,
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  makeMentionCustomProps,
  renderMatrixMention,
} from './react-custom-html-parser';

const settingsLinkBaseUrl = 'https://app.example';

const mockMx = {
  getUserId: () => '@alice:example.org',
  getRoom: () => undefined,
};

function Subject({ body }: { body: string }) {
  const options = getReactCustomHtmlParser(mockMx as never, undefined, {
    settingsLinkBaseUrl,
    linkifyOpts: LINKIFY_OPTS,
    handleMentionClick: undefined,
  });

  return <div>{parse(body, options)}</div>;
}

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
    expect(link.className).not.toContain(customHtmlCss.Mention({ highlight: true }));
    expect(link.className).toContain(customHtmlCss.MentionWithIcon);
    expect(link).not.toHaveTextContent('Settings:');
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
    expect(link.className).not.toContain(customHtmlCss.Mention({ highlight: true }));
    expect(link.className).toContain(customHtmlCss.MentionWithIcon);
  });

  it('renders matrix message permalinks with an icon instead of the Message prefix', () => {
    render(
      <div>
        {renderMatrixMention(
          {
            getUserId: () => '@alice:example.org',
            getRoom: () => ({ roomId: '!room:example.org', name: 'Lobby' }),
          } as never,
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
});
