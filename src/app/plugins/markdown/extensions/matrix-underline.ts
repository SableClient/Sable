import type { TokenizerExtension, RendererExtension, Tokens } from 'marked';

// Underline extension: __text__
export const matrixUnderlineExtension = {
  name: 'matrixUnderline',
  level: 'inline',
  start(src: string) {
    return src.indexOf('__');
  },
  tokenizer(
    this: {
      lexer: { inlineTokens: (t: string, tokens: Tokens.Generic[]) => void };
    },
    src: string
  ) {
    if (!src.startsWith('__')) return undefined;
    const rule = /^__(.+?)__/;
    const match = rule.exec(src);
    if (match) {
      const token = {
        type: 'matrixUnderline',
        raw: match[0],
        text: match[1],
        tokens: [] as Tokens.Generic[],
      };
      this.lexer.inlineTokens(token.text!, token.tokens);
      return token;
    }
    return undefined;
  },
  renderer(
    this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } },
    token: Tokens.Generic
  ) {
    const tokens = (token as { tokens: Tokens.Generic[] }).tokens || [];
    return `<u data-md="__">${this.parser.parseInline(tokens)}</u>`;
  },
} satisfies TokenizerExtension & RendererExtension;
