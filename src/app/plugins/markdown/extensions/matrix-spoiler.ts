import type { marked } from "marked";

// Extend marked's lexer to handle ||spoiler|| syntax
export const matrixSpoilerExtension = {
  name: "spoiler",
  level: "inline",
  start(src: string) {
    const idx = src.indexOf("||");
    return idx === -1 ? idx : idx;
  },
  tokenizer(src: string) {
    // Only match if || at the very start of the remaining text
    if (!src.startsWith("||")) return undefined;
    const rule = /^\|\|(.+?)\|\|/;
    const match = rule.exec(src);
    if (match) {
      return {
        type: "spoiler",
        raw: match[0],
        text: match[1],
      };
    }
  },
  renderer(token) {
    return `<span data-mx-spoiler>${token.text}</span>`;
  },
} satisfies marked.TokenizerExtension & marked.RendererExtension;
