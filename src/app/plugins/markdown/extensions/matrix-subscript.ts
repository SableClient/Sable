import type { TokenizerExtension, RendererExtension } from 'marked';

// Subscript extension: -# text (Matrix spec small/sub tag)
export const matrixSubscriptExtension = {
  name: 'subscript',
  level: 'block',
  start(src: string) {
    return src.indexOf('-#');
  },
  tokenizer(src: string) {
    const match = /^-# +(.+)/.exec(src);
    if (match) {
      return {
        type: 'subscript',
        raw: match[0],
        text: match[1],
      };
    }
    return undefined;
  },
  renderer(token: unknown) {
    return `<sub data-md="-#">${(token as { text: string }).text}</sub>`;
  },
} satisfies TokenizerExtension & RendererExtension;
