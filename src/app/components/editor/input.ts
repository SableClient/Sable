import type { Descendant } from 'slate';

import {
  MX_EMOTICON_MD_END,
  MX_EMOTICON_MD_SEP,
  MX_EMOTICON_MD_START,
  validateMxcUrl,
} from '$plugins/markdown/extensions/matrix-emoticon';
import { BlockType } from './types';
import type { ParagraphElement } from './slate';
import { createEmoticonElement } from './utils';

/** Matches placeholders emitted by htmlToMarkdown for &lt;img data-mx-emoticon&gt;. */
const MX_EMOTICON_MD_TOKEN = new RegExp(
  `${MX_EMOTICON_MD_START}([^${MX_EMOTICON_MD_SEP}]+)${MX_EMOTICON_MD_SEP}([^${MX_EMOTICON_MD_END}]+)${MX_EMOTICON_MD_END}`,
  'g'
);

function mergeAdjacentTextNodes(
  children: ParagraphElement['children']
): ParagraphElement['children'] {
  const out: ParagraphElement['children'] = [];
  for (const c of children) {
    if ('type' in c) {
      out.push(c);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && !('type' in prev)) {
      prev.text += c.text;
    } else {
      out.push({ ...c });
    }
  }
  return out.length > 0 ? out : [{ text: '' }];
}

function lineToParagraphChildren(line: string): ParagraphElement['children'] {
  MX_EMOTICON_MD_TOKEN.lastIndex = 0;
  const parts: ParagraphElement['children'] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = MX_EMOTICON_MD_TOKEN.exec(line)) !== null) {
    if (match.index > last) {
      parts.push({ text: line.slice(last, match.index) });
    }
    const [, src, shortcode] = match;
    if (src && shortcode && validateMxcUrl(src)) {
      parts.push(createEmoticonElement(src, shortcode));
    } else if (shortcode) {
      parts.push({ text: `:${shortcode.replace(/^:|:$/g, '')}:` });
    }
    last = MX_EMOTICON_MD_TOKEN.lastIndex;
  }
  if (last < line.length) {
    parts.push({ text: line.slice(last) });
  }
  return mergeAdjacentTextNodes(parts);
}

export const plainToEditorInput = (text: string): Descendant[] => {
  const lines = text.split('\n');
  return lines.map((lineText) => ({
    type: BlockType.Paragraph,
    children: lineToParagraphChildren(lineText),
  }));
};
