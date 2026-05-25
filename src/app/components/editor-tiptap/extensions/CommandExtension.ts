import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Inline void node representing a /command inserted at the beginning of the message.
 */
export const CommandExtension = Node.create({
  name: 'command',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      command: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-command]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-command': '' }, HTMLAttributes)];
  },

  renderText({ node }) {
    return `/${node.attrs.command ?? ''}`;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addCommands(): any {
    return {
      insertCommand:
        (command: string) =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) =>
          commands.insertContent({ type: this.name, attrs: { command } }),
    };
  },
});
