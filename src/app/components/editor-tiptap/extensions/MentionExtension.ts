import Mention from '@tiptap/extension-mention';

/**
 * Extended Mention node that stores the extra Matrix-specific attrs we need
 * (nodeType, highlight, viaServers, eventId) alongside the base id/label.
 */
export const MatrixMentionExtension = Mention.extend({
  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
      /** 'user' | 'room' */
      nodeType: { default: 'user' },
      highlight: { default: false },
      viaServers: { default: null },
      eventId: { default: null },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      {
        'data-mention': '',
        'data-mention-type': node.attrs.nodeType,
        ...HTMLAttributes,
      },
      `${node.attrs.nodeType === 'room' ? '' : '@'}${node.attrs.label ?? node.attrs.id ?? ''}`,
    ];
  },

  renderText({ node }) {
    return node.attrs.id ?? node.attrs.label ?? '';
  },
});
