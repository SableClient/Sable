import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Inline void node representing a custom emoticon (mxc:// image or plain emoji char).
 */
export const EmoticonExtension = Node.create({
  name: 'emoticon',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      /** mxc:// URL or plain emoji character / shortcode key */
      key: { default: null },
      shortcode: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-emoticon]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-emoticon': '' }, HTMLAttributes)];
  },

  renderText({ node }) {
    const { key, shortcode } = node.attrs as { key: string | null; shortcode: string | null };
    if (!key) return '';
    return key.startsWith('mxc://') ? `:${shortcode ?? ''}:` : key;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addCommands(): any {
    return {
      insertEmoticon:
        (attrs: { key: string; shortcode: string }) =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
