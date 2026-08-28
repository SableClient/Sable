import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorDocument, InlineToken } from './model';
import { emptyEditorDocument, isEditorText } from './model';
import { BlockType } from './types';

export const editorSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    // Reset UA margins so a one-line composer stays one line high.
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', { style: 'margin: 0' }, 0],
    },
    text: { group: 'inline' },
    link: {
      inline: true,
      content: 'text*',
      group: 'inline',
      attrs: { href: {} },
      parseDOM: [{ tag: 'a[href]', getAttrs: (dom) => ({ href: dom.getAttribute('href') }) }],
      toDOM: (node) => ['a', { href: node.attrs.href }, 0],
    },
    // Node views render these in-editor; toDOM is the clipboard shape, so it
    // must carry every attribute parseDOM needs to rebuild the node.
    mention: {
      inline: true,
      atom: true,
      group: 'inline',
      selectable: true,
      attrs: {
        id: {},
        eventId: { default: null },
        viaServers: { default: null },
        highlight: { default: false },
        name: {},
      },
      parseDOM: [
        {
          tag: 'span[data-sable-mention]',
          getAttrs: (dom) => ({
            id: dom.getAttribute('data-sable-mention'),
            name: dom.getAttribute('data-mention-name') ?? dom.textContent ?? '',
            eventId: dom.getAttribute('data-mention-event-id'),
            viaServers: dom.getAttribute('data-mention-via')?.split(',') ?? null,
            highlight: dom.getAttribute('data-mention-highlight') === 'true',
          }),
        },
      ],
      toDOM: (node) => [
        'span',
        {
          'data-sable-mention': node.attrs.id,
          'data-mention-name': node.attrs.name,
          ...(node.attrs.eventId ? { 'data-mention-event-id': node.attrs.eventId } : {}),
          ...((node.attrs.viaServers as string[] | null)?.length
            ? { 'data-mention-via': (node.attrs.viaServers as string[]).join(',') }
            : {}),
          ...(node.attrs.highlight ? { 'data-mention-highlight': 'true' } : {}),
        },
        node.attrs.name,
      ],
    },
    emoticon: {
      inline: true,
      atom: true,
      group: 'inline',
      selectable: true,
      attrs: { key: {}, shortcode: {} },
      parseDOM: [
        {
          tag: 'span[data-sable-emoticon]',
          getAttrs: (dom) => ({
            key: dom.getAttribute('data-sable-emoticon'),
            shortcode: dom.getAttribute('data-emoticon-shortcode') ?? '',
          }),
        },
      ],
      toDOM: (node) => [
        'span',
        {
          'data-sable-emoticon': node.attrs.key,
          'data-emoticon-shortcode': node.attrs.shortcode,
        },
        `:${node.attrs.shortcode}:`,
      ],
    },
    command: {
      inline: true,
      atom: true,
      group: 'inline',
      selectable: true,
      attrs: { command: {} },
      parseDOM: [
        {
          tag: 'span[data-sable-command]',
          getAttrs: (dom) => ({ command: dom.getAttribute('data-sable-command') }),
        },
      ],
      toDOM: (node) => [
        'span',
        { 'data-sable-command': node.attrs.command },
        `/${node.attrs.command}`,
      ],
    },
  },
});

export const toProseMirrorInline = (token: InlineToken): ProseMirrorNode | null => {
  if (isEditorText(token)) return token.text ? editorSchema.text(token.text) : null;
  switch (token.type) {
    case BlockType.Link:
      return editorSchema.nodes.link.create(
        { href: token.href },
        token.children
          .map(toProseMirrorInline)
          .filter((child): child is ProseMirrorNode => child !== null)
      );
    case BlockType.Mention:
      return editorSchema.nodes.mention.create({
        id: token.id,
        eventId: token.eventId ?? null,
        viaServers: token.viaServers ?? null,
        highlight: token.highlight,
        name: token.name,
      });
    case BlockType.Emoticon:
      return editorSchema.nodes.emoticon.create({ key: token.key, shortcode: token.shortcode });
    case BlockType.Command:
      return editorSchema.nodes.command.create({ command: token.command });
    default:
      return null;
  }
};

export const toProseMirrorDocument = (document: EditorDocument) =>
  editorSchema.node(
    'doc',
    undefined,
    (document.length ? document : emptyEditorDocument()).map((paragraph) =>
      editorSchema.nodes.paragraph.create(
        undefined,
        paragraph.children
          .map(toProseMirrorInline)
          .filter((child): child is ProseMirrorNode => child !== null)
      )
    )
  );

const fromProseMirrorInline = (node: ProseMirrorNode): InlineToken => {
  if (node.isText) return { text: node.text ?? '' };
  switch (node.type.name) {
    case 'link':
      return {
        type: BlockType.Link,
        href: node.attrs.href as string,
        children: node.content.content.map(fromProseMirrorInline) as { text: string }[],
      };
    case 'mention':
      return {
        type: BlockType.Mention,
        id: node.attrs.id as string,
        eventId: node.attrs.eventId ?? undefined,
        viaServers: node.attrs.viaServers ?? undefined,
        highlight: Boolean(node.attrs.highlight),
        name: node.attrs.name as string,
        children: [{ text: '' }],
      };
    case 'emoticon':
      return {
        type: BlockType.Emoticon,
        key: node.attrs.key as string,
        shortcode: node.attrs.shortcode as string,
        children: [{ text: '' }],
      };
    case 'command':
      return {
        type: BlockType.Command,
        command: node.attrs.command as string,
        children: [{ text: '' }],
      };
    default:
      return { text: node.textContent };
  }
};

export const fromProseMirrorDocument = (doc: ProseMirrorNode): EditorDocument => {
  const document: EditorDocument = [];
  doc.forEach((paragraph) => {
    const children = paragraph.content.content.map(fromProseMirrorInline);
    // ProseMirror has no empty text nodes; isEmpty and the serializers require
    // at least one text token per paragraph.
    document.push({
      type: BlockType.Paragraph,
      children: children.length ? children : [{ text: '' }],
    });
  });
  return document.length ? document : emptyEditorDocument();
};
