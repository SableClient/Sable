import type { TokenizerExtension, RendererExtension, Tokens } from 'marked';

// Extend marked's lexer to handle ||spoiler|| syntax
export const matrixSpoilerExtension = {
  name: 'spoiler',
  level: 'inline',
  start(src: string) {
    return src.indexOf('||');
  },
  tokenizer(
    this: { lexer: { inlineTokens: (t: string, tokens: Tokens.Generic[]) => void } },
    src: string
  ) {
    // Only match if || at the very start of the remaining text
    if (!src.startsWith('||')) return undefined;
    const rule = /^\|\|(.+?)\|\|/;
    const match = rule.exec(src);
    if (match) {
      const token = {
        type: 'spoiler',
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
    return `<span data-mx-spoiler>${this.parser.parseInline(tokens)}</span>`;
  },
} satisfies TokenizerExtension & RendererExtension;
