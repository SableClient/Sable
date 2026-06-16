import { describe, expect, it } from 'vitest';
import { buildMessagePreviewFromContent } from './messagePreview';

describe('buildMessagePreviewFromContent', () => {
  it('returns plain text preview for text messages', () => {
    expect(
      buildMessagePreviewFromContent({
        content: { msgtype: 'm.text', body: 'Hello' },
        eventType: 'm.room.message',
      })
    ).toMatchObject({ kind: 'text', text: 'Hello' });
  });

  it('strips reply fallback from text messages', () => {
    expect(
      buildMessagePreviewFromContent({
        content: { msgtype: 'm.text', body: '> quote\n\nReal message' },
        eventType: 'm.room.message',
      })
    ).toMatchObject({ text: 'Real message' });
  });

  it('extracts formatted body and flags block content', () => {
    expect(
      buildMessagePreviewFromContent({
        content: {
          msgtype: 'm.text',
          body: '```ts\nconst x = 1;\n```',
          formatted_body: '<pre><code>const x = 1;</code></pre>',
        },
        eventType: 'm.room.message',
      })
    ).toMatchObject({ kind: 'unsupported', hasBlockContent: true, text: '💻 Code Block' });
  });

  it('does not classify generic block wrappers as code blocks', () => {
    expect(
      buildMessagePreviewFromContent({
        content: {
          msgtype: 'm.text',
          body: 'Hello world',
          formatted_body: '<div><strong>Hello</strong> world</div>',
        },
        eventType: 'm.room.message',
      })
    ).toMatchObject({
      kind: 'text',
      text: 'Hello world',
      formattedBody: '<div><strong>Hello</strong> world</div>',
    });
  });

  it('trims mx-reply wrapper before block detection on formatted replies', () => {
    expect(
      buildMessagePreviewFromContent({
        content: {
          msgtype: 'm.text',
          body: '> <@alice:test> quoted\n\nHello **world**',
          formatted_body:
            '<mx-reply><blockquote>quoted</blockquote></mx-reply><p>Hello <strong>world</strong></p>',
        },
        eventType: 'm.room.message',
      })
    ).toMatchObject({
      kind: 'text',
      text: 'Hello **world**',
      formattedBody: '<p>Hello <strong>world</strong></p>',
    });
  });

  it('returns link placeholder for link-only messages', () => {
    expect(
      buildMessagePreviewFromContent({
        content: { msgtype: 'm.text', body: 'https://example.com' },
        eventType: 'm.room.message',
      })
    ).toMatchObject({ kind: 'link', text: '🔗 Link', isLinkOnly: true });
  });

  it('returns media placeholders', () => {
    expect(
      buildMessagePreviewFromContent({
        content: { msgtype: 'm.image', body: 'image.png' },
        eventType: 'm.room.message',
      })
    ).toMatchObject({ kind: 'image', text: '📷 Image' });
  });
});
