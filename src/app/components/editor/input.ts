import type { Descendant } from 'slate';

import { BlockType } from './types';
import type { ParagraphElement } from './slate';

export const plainToEditorInput = (text: string): Descendant[] => {
  const editorNodes: Descendant[] = text.split('\n').map((lineText) => {
    const paragraphNode: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [
        {
          text: lineText,
        },
      ],
    };
    return paragraphNode;
  });
  return editorNodes;
};
