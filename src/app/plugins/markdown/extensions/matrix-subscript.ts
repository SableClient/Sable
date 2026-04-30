import type { TokenizerExtension, RendererExtension, Tokens } from 'marked';

// Subscript extension: -# text (Matrix spec small/sub tag)
export const matrixSubscriptExtension = {
  name: 'subscript',
  level: 'block',
  start(src: string) {
    return src.indexOf('-#');
  },
  tokenizer(
    this: { lexer: { inlineTokens: (t: string, tokens: Tokens.Generic[]) => void } },
    src: string
  ) {
    const match = /^-# +(.+)/.exec(src);
    if (match) {
      const token = {
        type: 'subscript',
        raw: match[0],
        text: match[1],
        tokens: [] as Tokens.Generic[],
      };
      this.lexer.inlineTokens(token.text, token.tokens);
      return token;
    }
    return undefined;
  },
  renderer(
    this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } },
    token: Tokens.Generic
  ) {
    const tokens = (token as { tokens: Tokens.Generic[] }).tokens || [];
    return `<sub data-md="-#">${this.parser.parseInline(tokens)}</sub>`;
  },
} satisfies TokenizerExtension & RendererExtension;
