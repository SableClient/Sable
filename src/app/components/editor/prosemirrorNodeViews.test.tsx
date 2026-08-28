import { act, render } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { DOMParser as ProseMirrorDOMParser, DOMSerializer } from 'prosemirror-model';
import type { EditorDocument } from './model';
import { ProseMirrorEditable } from './ProseMirrorEditable';
import { ProseMirrorEditorController } from './prosemirrorController';
import { editorSchema, fromProseMirrorDocument, toProseMirrorDocument } from './prosemirrorSchema';
import { BlockType } from './types';

const emptyClientRects = () => [] as unknown as DOMRectList;
beforeAll(() => {
  Element.prototype.getClientRects ??= emptyClientRects;
  (Text.prototype as unknown as Element).getClientRects ??= emptyClientRects;
});

const paragraph = (...children: EditorDocument[number]['children']): EditorDocument => [
  { type: BlockType.Paragraph, children },
];

const mention = (overrides: Record<string, unknown> = {}) => ({
  type: BlockType.Mention as const,
  id: '@bob:example.org',
  highlight: false,
  name: 'bob',
  children: [{ text: '' }],
  ...overrides,
});

const mount = (document: EditorDocument) => {
  const controller = new ProseMirrorEditorController(document);
  const { container } = render(<ProseMirrorEditable controller={controller} />);
  return { container, controller };
};

describe('atom node views', () => {
  it('renders a mention as a styled, non-editable pill', () => {
    const { container } = mount(paragraph({ text: '' }, mention()));
    const pill = container.querySelector('.ProseMirror > p > span')!;

    expect(pill).toHaveAttribute('contenteditable', 'false');
    expect(pill.className).not.toBe('');
    expect(pill).toHaveTextContent('bob');
  });

  it('renders an mxc emoticon as an image via the render context', () => {
    const controller = new ProseMirrorEditorController(
      paragraph({
        type: BlockType.Emoticon,
        key: 'mxc://example.org/abc',
        shortcode: 'party',
        children: [{ text: '' }],
      })
    );
    controller.setRenderContext({
      emoticonSrc: () => 'https://example.org/_matrix/media/abc',
      mentionDisplayName: (token) => token.name,
    });
    const { container } = render(<ProseMirrorEditable controller={controller} />);

    const img = container.querySelector('img[alt="party"]');
    expect(img).toHaveAttribute('src', 'https://example.org/_matrix/media/abc');
  });

  it('renders a unicode emoticon as text rather than an image', () => {
    const { container } = mount(
      paragraph({
        type: BlockType.Emoticon,
        key: '🎉',
        shortcode: 'party',
        children: [{ text: '' }],
      })
    );

    expect(container.querySelector('img[alt="party"]')).toBeNull();
    expect(container.querySelector('.ProseMirror')).toHaveTextContent('🎉');
  });

  it('drops the command’s active styling once text precedes it', () => {
    const command = {
      type: BlockType.Command as const,
      command: 'shrug',
      children: [{ text: '' }],
    };
    const { container, controller } = mount(paragraph(command));
    const activeClass = (container.querySelector('.ProseMirror > p > span') as HTMLElement)
      .className;

    act(() => controller.setDocument(paragraph({ text: 'hi ' }, command)));

    const pill = container.querySelector('.ProseMirror > p > span') as HTMLElement;
    expect(pill).toHaveTextContent('/shrug');
    expect(pill.className).not.toBe(activeClass);
  });

  it('keeps the command active when only whitespace precedes it', () => {
    const command = {
      type: BlockType.Command as const,
      command: 'shrug',
      children: [{ text: '' }],
    };
    const { container } = mount(paragraph(command));
    const activeClass = (container.querySelector('.ProseMirror > p > span') as HTMLElement)
      .className;
    const { container: spaced } = mount(paragraph({ text: '  ' }, command));

    expect((spaced.querySelector('.ProseMirror > p > span') as HTMLElement).className).toBe(
      activeClass
    );
  });

  it('renders a command as a non-editable pill', () => {
    const { container } = mount(
      paragraph(
        { text: '' },
        { type: BlockType.Command, command: 'shrug', children: [{ text: '' }] }
      )
    );
    const pill = container.querySelector('.ProseMirror > p > span')!;

    expect(pill).toHaveAttribute('contenteditable', 'false');
    expect(pill).toHaveTextContent('/shrug');
  });
});

/** Serializes a document to clipboard HTML and parses it back. */
const roundTrip = (document: EditorDocument): EditorDocument => {
  const source = toProseMirrorDocument(document);
  const html = window.document.createElement('div');
  html.append(DOMSerializer.fromSchema(editorSchema).serializeFragment(source.content));
  return fromProseMirrorDocument(ProseMirrorDOMParser.fromSchema(editorSchema).parse(html));
};

describe('clipboard round-trip', () => {
  it('preserves a mention with all of its routing attributes', () => {
    const document = paragraph(
      mention({ eventId: '$event:example.org', viaServers: ['a.org', 'b.org'], highlight: true })
    );

    expect(roundTrip(document)).toEqual(document);
  });

  it('preserves a plain mention', () => {
    const document = paragraph(mention());

    expect(roundTrip(document)).toEqual(document);
  });

  it('preserves an emoticon', () => {
    const document = paragraph({
      type: BlockType.Emoticon,
      key: 'mxc://example.org/abc',
      shortcode: 'party',
      children: [{ text: '' }],
    });

    expect(roundTrip(document)).toEqual(document);
  });

  it('preserves a command', () => {
    const document = paragraph({
      type: BlockType.Command,
      command: 'shrug',
      children: [{ text: '' }],
    });

    expect(roundTrip(document)).toEqual(document);
  });

  it('preserves a link and its text', () => {
    const document = paragraph({
      type: BlockType.Link,
      href: 'https://example.org/',
      children: [{ text: 'example' }],
    });

    expect(roundTrip(document)).toEqual(document);
  });

  it('preserves multiple paragraphs', () => {
    const document: EditorDocument = [
      { type: BlockType.Paragraph, children: [{ text: 'one' }] },
      { type: BlockType.Paragraph, children: [{ text: 'two' }] },
    ];

    expect(roundTrip(document)).toEqual(document);
  });
});
