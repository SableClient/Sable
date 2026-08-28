import { describe, expect, it } from 'vitest';
import { BlockType } from './types';
import type { EditorDocument } from './model';
import { ProseMirrorEditorController } from './prosemirrorController';
import { toMatrixCustomHTML, toPlainText } from './output';
import { fromProseMirrorDocument, toProseMirrorDocument } from './prosemirrorSchema';

describe('ProseMirror editor schema', () => {
  it('round-trips Sable inline tokens without exposing engine JSON', () => {
    const document: EditorDocument = [
      {
        type: BlockType.Paragraph,
        children: [
          { text: 'Hi ' },
          {
            type: BlockType.Mention,
            id: '@alice:example.org',
            name: '@Alice',
            highlight: false,
            children: [{ text: '' }],
          },
          { text: ' ' },
          {
            type: BlockType.Emoticon,
            key: 'mxc://example.org/emote',
            shortcode: 'wave',
            children: [{ text: '' }],
          },
        ],
      },
    ];

    expect(fromProseMirrorDocument(toProseMirrorDocument(document))).toEqual(document);
  });

  it('keeps draft state behind the controller seam', () => {
    const controller = new ProseMirrorEditorController();
    const changes: EditorDocument[] = [];
    controller.subscribe((document) => changes.push(document));

    controller.setDocument([{ type: BlockType.Paragraph, children: [{ text: 'draft' }] }]);
    const draft = controller.getDocument();
    draft[0]!.children[0] = { text: 'mutated outside the controller' };

    expect(controller.getDocument()[0]!.children).toEqual([{ text: 'draft' }]);
    expect(changes).toHaveLength(1);
  });

  it('keeps insertion and autocomplete behind the controller seam', () => {
    const controller = new ProseMirrorEditorController();
    const root = document.createElement('div');
    const unmount = controller.mount(root);

    controller.insertText(':wave');
    const query = controller.getAutocompleteQuery([':'] as const);
    expect(query).toEqual({ from: 1, to: 6, prefix: ':', text: 'wave' });

    controller.insertInline(
      {
        type: BlockType.Emoticon,
        key: '👋',
        shortcode: 'wave',
        children: [{ text: '' }],
      },
      query?.from,
      query?.to
    );

    expect(controller.getDocument()).toEqual([
      {
        type: BlockType.Paragraph,
        children: [
          {
            type: BlockType.Emoticon,
            key: '👋',
            shortcode: 'wave',
            children: [{ text: '' }],
          },
        ],
      },
    ]);
    unmount();
  });

  it('feeds the existing Matrix serializers with an engine-neutral document', () => {
    const document: EditorDocument = [
      {
        type: BlockType.Paragraph,
        children: [
          { text: 'See ' },
          {
            type: BlockType.Link,
            href: 'https://example.org',
            children: [{ text: 'example' }],
          },
        ],
      },
    ];

    expect(toPlainText(document)).toBe('See [example](https://example.org)\n');
    expect(toMatrixCustomHTML(document, {})).toContain('https://example.org');
  });
});
