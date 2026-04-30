import type { TokenizerExtension, RendererExtension } from 'marked';

// Extend marked's lexer to handle ||spoiler|| syntax
export const matrixSpoilerExtension = {
  name: 'spoiler',
  level: 'inline',
  start(src: string) {
    return src.indexOf('||');
  },
  tokenizer(this: any, src: string) {
    // Only match if || at the very start of the remaining text
    if (!src.startsWith('||')) return undefined;
    const rule = /^\|\|(.+?)\|\|/;
    const match = rule.exec(src);
    if (match) {
      const token = {
        type: 'spoiler',
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
    return `<span data-mx-spoiler>${this.parser.parseInline(token.tokens)}</span>`;
  },
} satisfies TokenizerExtension & RendererExtension;
