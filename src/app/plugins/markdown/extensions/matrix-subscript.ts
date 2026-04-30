import type { TokenizerExtension, RendererExtension } from 'marked';

// Subscript extension: -# text (Matrix spec small/sub tag)
export const matrixSubscriptExtension = {
  name: 'subscript',
  level: 'block',
  start(src: string) {
    return src.indexOf('-#');
  },
  tokenizer(this: any, src: string) {
    const match = /^-# +(.+)/.exec(src);
    if (match) {
      const token = {
        type: 'subscript',
        raw: match[0],
        text: match[1],
        tokens: [] as any[],
      };
      this.lexer.inlineTokens(token.text, token.tokens);
      return token;
    }
    return undefined;
  },
  renderer(this: any, token: any) {
    return `<sub data-md="-#">${this.parser.parseInline(token.tokens)}</sub>`;
  },
} satisfies TokenizerExtension & RendererExtension;
