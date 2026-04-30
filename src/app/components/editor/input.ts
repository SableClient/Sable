import type { Descendant } from 'slate';

import { escapeMarkdownInlineSequences, escapeMarkdownBlockSequences } from '$plugins/markdown';
import { BlockType } from './types';
import type { ParagraphElement } from './slate';

export const plainToEditorInput = (text: string, markdown?: boolean): Descendant[] => {
  const editorNodes: Descendant[] = text.split('\n').map((lineText) => {
    const paragraphNode: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [
        {
          text: markdown
            ? escapeMarkdownBlockSequences(lineText, escapeMarkdownInlineSequences)
            : lineText,
        },
      ],
    };
    return paragraphNode;
  });
  return editorNodes;
};
