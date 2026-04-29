import type { marked } from "marked";

// Subscript extension: -# text (Matrix spec small/sub tag)
export const matrixSubscriptExtension = {
  name: "subscript",
  level: "block",
  start(src: string) {
    return src.indexOf("-#");
  },
  tokenizer(src: string) {
    const match = /^-# +(.+)/.exec(src);
    if (match) {
      return {
        type: "subscript",
        raw: match[0],
        text: match[1],
      };
    }
  },
  renderer(token: { text: string }) {
    return `<sub data-md="-#">${token.text}</sub>`;
  },
};
