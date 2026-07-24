import type { KeyboardEvent } from 'react';
import { Editor, Range, Transforms } from 'slate';
import { HistoryEditor } from 'slate-history';
import type { ShortcutId, ShortcutOverrides } from '../../keyboard/shortcuts';
import { matchesShortcut } from '../../keyboard/shortcuts';

export const INLINE_MARKERS = {
  'composer.bold': '**',
  'composer.italic': '*',
  'composer.underline': '__',
  'composer.strikethrough': '~~',
  'composer.inlineCode': '`',
  'composer.spoiler': '||',
} satisfies Partial<Record<ShortcutId, string>>;

export const BLOCK_PREFIXES = {
  'composer.heading1': '# ',
  'composer.heading2': '## ',
  'composer.heading3': '### ',
  'composer.blockquote': '> ',
  'composer.codeBlock': '```\n',
  'composer.orderedList': '1. ',
  'composer.unorderedList': '- ',
} satisfies Partial<Record<ShortcutId, string>>;

const INLINE_ACTIONS = Object.entries(INLINE_MARKERS) as [ShortcutId, string][];
const BLOCK_ACTIONS = Object.entries(BLOCK_PREFIXES) as [ShortcutId, string][];

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
export const toggleKeyboardShortcut = (
  editor: Editor,
  event: KeyboardEvent,
  overrides: ShortcutOverrides
): boolean => {
  if (matchesShortcut('composer.undo', event, overrides)) {
    event.preventDefault();
    HistoryEditor.undo(editor as HistoryEditor);
    return true;
  }
  if (matchesShortcut('composer.redo', event, overrides)) {
    event.preventDefault();
    HistoryEditor.redo(editor as HistoryEditor);
    return true;
  }

  const blockToggled = BLOCK_ACTIONS.find(([id, prefix]) => {
    if (matchesShortcut(id, event, overrides)) {
      event.preventDefault();
      applyMarkdownBlockPrefix(editor, prefix);
      return true;
    }
    return false;
  });
  if (blockToggled) return true;

  const inlineToggled = INLINE_ACTIONS.find(([id, marker]) => {
    if (matchesShortcut(id, event, overrides)) {
      event.preventDefault();
      applyMarkdownInline(editor, marker);
      return true;
    }
    return false;
  });
  return !!inlineToggled;
};
