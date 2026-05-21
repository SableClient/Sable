import type { TokenizerExtension, RendererExtension, Tokens } from 'marked';
import { MFM_HEX_COLOR_VALUE_PATTERN, normalizeMfmHexToMatrixColor } from '$utils/matrixHtml';

export type MfmColorArgs = {
  fg?: string;
  bg?: string;
};

const MFM_COLOR_FN_START = /^\$\[(?=(?:fg\.color|bg\.color)=)/;
const MFM_COLOR_ARGS_PREFIX = new RegExp(
  `^((?:(?:fg|bg)\\.color=${MFM_HEX_COLOR_VALUE_PATTERN}\\s*)+)`
);

/** Parses `fg.color=…` / `bg.color=…` tokens from the inside of `$[…]`. */
export function parseMfmColorFnArgs(argsPart: string): MfmColorArgs | undefined {
  const trimmed = argsPart.trim();
  if (!trimmed) return undefined;

  const result: MfmColorArgs = {};
  const tokens = trimmed.split(/\s+/);

  for (const token of tokens) {
    const m = new RegExp(`^(fg|bg)\\.color=(${MFM_HEX_COLOR_VALUE_PATTERN})$`).exec(token);
    if (!m) return undefined;
    const normalized = normalizeMfmHexToMatrixColor(m[2]!);
    if (!normalized) return undefined;
    if (m[1] === 'fg') result.fg = normalized;
    else result.bg = normalized;
  }

  return result.fg !== undefined || result.bg !== undefined ? result : undefined;
}

/** Opening args for `data-md` round-trip, e.g. `$[fg.color=ff0000 bg.color=00ff00`. */
export function formatMfmColorDataMd(args: MfmColorArgs): string {
  const parts: string[] = [];
  if (args.fg) {
    parts.push(`fg.color=${args.fg.replace(/^#/, '').toLowerCase()}`);
  }
  if (args.bg) {
    parts.push(`bg.color=${args.bg.replace(/^#/, '').toLowerCase()}`);
  }
  return `$[${parts.join(' ')}`;
}

export function tryParseMfmColor(
  src: string
): { raw: string; args: MfmColorArgs; text: string; dataMd: string } | undefined {
  if (!MFM_COLOR_FN_START.test(src)) return undefined;

  const close = src.indexOf(']');
  if (close <= 2) return undefined;

  const inner = src.slice(2, close);
  const argsMatch = MFM_COLOR_ARGS_PREFIX.exec(inner);
  if (!argsMatch) return undefined;

  const argsPart = argsMatch[1]!.trimEnd();
  const text = inner.slice(argsMatch[0].length).trimStart();
  if (!text) return undefined;
  const args = parseMfmColorFnArgs(argsPart);
  if (!args) return undefined;

  return {
    raw: src.slice(0, close + 1),
    args,
    text,
    dataMd: `$[${argsPart}`,
  };
}

export const matrixMfmColorExtension = {
  name: 'mfmColor',
  level: 'inline',
  start(src: string) {
    const fg = src.indexOf('$[fg.color=');
    const bg = src.indexOf('$[bg.color=');
    if (fg === -1) return bg;
    if (bg === -1) return fg;
    return Math.min(fg, bg);
  },
  tokenizer(
    this: { lexer: { inlineTokens: (t: string, tokens: Tokens.Generic[]) => void } },
    src: string
  ) {
    const parsed = tryParseMfmColor(src);
    if (!parsed) return undefined;

    const token = {
      type: 'mfmColor',
      raw: parsed.raw,
      text: parsed.text,
      mfmArgs: parsed.args,
      dataMd: parsed.dataMd,
      tokens: [] as Tokens.Generic[],
    };
    this.lexer.inlineTokens(parsed.text, token.tokens);
    return token;
  },
  renderer(
    this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } },
    token: Tokens.Generic
  ) {
    const t = token as unknown as {
      tokens?: Tokens.Generic[];
      mfmArgs: MfmColorArgs;
      dataMd: string;
    };
    const inner = this.parser.parseInline(t.tokens ?? []);
    const attrs: string[] = [`data-md="${t.dataMd}"`];
    if (t.mfmArgs.fg) attrs.push(`data-mx-color="${t.mfmArgs.fg}"`);
    if (t.mfmArgs.bg) attrs.push(`data-mx-bg-color="${t.mfmArgs.bg}"`);
    return `<span ${attrs.join(' ')}>${inner}</span>`;
  },
} satisfies TokenizerExtension & RendererExtension;
