import type { TokenizerExtension, RendererExtension } from 'marked';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Inline math: $...$
export const matrixMathExtension = {
  name: 'math',
  level: 'inline',
  start(src: string) {
    return src.indexOf('$');
  },
  tokenizer(src: string) {
    const match = /^\$([^$]+)\$/.exec(src);
    if (match) {
      return {
        type: 'math',
        raw: match[0],
        latex: match[1],
      };
    }
    return undefined;
  },
  renderer(token) {
    return `<span data-mx-maths="${escapeHtml(token.latex)}">${token.latex}</span>`;
  },
} satisfies TokenizerExtension & RendererExtension;

// Block math: $$...$$
export const matrixMathBlockExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src: string) {
    return src.indexOf('$$');
  },
  tokenizer(src: string) {
    const match = /^\$\$([^$]+)\$\$\n?/.exec(src);
    if (match) {
      return {
        type: 'mathBlock',
        raw: match[0],
        latex: match[1]?.trim() ?? '',
      };
    }
    return undefined;
  },
  renderer(token) {
    return `<div data-mx-maths="${escapeHtml(token.latex)}">${token.latex}</div>`;
  },
} satisfies TokenizerExtension & RendererExtension;
