import { createEditor, Editor, Transforms } from 'slate';
import { describe, expect, it } from 'vitest';
import { getPrevWorldRange } from './utils';
import { BlockType } from './types';

const createTestEditor = (text: string) => {
  const editor = createEditor();
  editor.children = [{ type: BlockType.Paragraph, children: [{ text }] }];
  return editor;
};

const selectAt = (editor: Editor, offset: number) => {
  Transforms.select(editor, { path: [0, 0], offset });
};

describe('getPrevWorldRange', () => {
  it('returns the word before the cursor', () => {
    const editor = createTestEditor('hello :smile world');
    selectAt(editor, 12);

    const range = getPrevWorldRange(editor);
    expect(range && Editor.string(editor, range)).toBe(':smile');
  });

  it('returns the whole word when the cursor sits inside it', () => {
    const editor = createTestEditor('hello :smile world');
    selectAt(editor, 9);

    const range = getPrevWorldRange(editor);
    expect(range && Editor.string(editor, range)).toBe(':smile');
  });

  it('returns the whole word when the cursor sits inside the last word', () => {
    const editor = createTestEditor('hello :smile');
    selectAt(editor, 9);

    const range = getPrevWorldRange(editor);
    expect(range && Editor.string(editor, range)).toBe(':smile');
  });
});
