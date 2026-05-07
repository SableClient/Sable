import { isKeyHotkey } from 'is-hotkey';
import type { KeyboardEvent } from 'react';
import { Editor, Range, Transforms } from 'slate';

export const INLINE_HOTKEYS: Record<string, string> = {
  'mod+b': '**',
  'mod+i': '*',
  'mod+u': '__',
  'mod+s': '~~',
  'mod+[': '`',
  'mod+h': '||',
};
const INLINE_KEYS = Object.keys(INLINE_HOTKEYS);

export const BLOCK_HOTKEYS: Record<string, string> = {
  'mod+7': '1. ',
  'mod+8': '- ',
  "mod+'": '> ',
  'mod+;': '```\n',
};
const BLOCK_KEYS = Object.keys(BLOCK_HOTKEYS);
const isHeading1 = isKeyHotkey('mod+1');
const isHeading2 = isKeyHotkey('mod+2');
const isHeading3 = isKeyHotkey('mod+3');

export const applyMarkdownInline = (editor: Editor, marker: string) => {
  if (editor.selection && Range.isExpanded(editor.selection)) {
    const text = Editor.string(editor, editor.selection);
    Transforms.insertText(editor, `${marker}${text}${marker}`);
  } else {
    Transforms.insertText(editor, `${marker}${marker}`);
    Transforms.move(editor, { distance: marker.length, reverse: true });
  }
};

export const applyMarkdownBlockPrefix = (editor: Editor, prefix: string) => {
  if (editor.selection) {
    const path = editor.selection.anchor.path;
    const startPoint = Editor.start(editor, path);
    Transforms.insertText(editor, prefix, { at: startPoint });
  }
};

/**
 * @return boolean true if shortcut is toggled.
 */
export const toggleKeyboardShortcut = (editor: Editor, event: KeyboardEvent): boolean => {
  if (isKeyHotkey('escape', event)) {
    return false;
  }

  const blockToggled = BLOCK_KEYS.find((hotkey) => {
    if (isKeyHotkey(hotkey, event)) {
      event.preventDefault();
      applyMarkdownBlockPrefix(editor, BLOCK_HOTKEYS[hotkey]!);
      return true;
    }
    return false;
  });
  if (blockToggled) return true;

  if (isHeading1(event)) {
    event.preventDefault();
    applyMarkdownBlockPrefix(editor, '# ');
    return true;
  }
  if (isHeading2(event)) {
    event.preventDefault();
    applyMarkdownBlockPrefix(editor, '## ');
    return true;
  }
  if (isHeading3(event)) {
    event.preventDefault();
    applyMarkdownBlockPrefix(editor, '### ');
    return true;
  }

  const inlineToggled = INLINE_KEYS.find((hotkey) => {
    if (isKeyHotkey(hotkey, event)) {
      event.preventDefault();
      applyMarkdownInline(editor, INLINE_HOTKEYS[hotkey]!);
      return true;
    }
    return false;
  });
  return !!inlineToggled;
};
