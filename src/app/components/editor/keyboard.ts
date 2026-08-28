import type { KeyboardEvent } from 'react';
import type { ProseMirrorEditorController } from './prosemirrorController';
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

/** Same user-configurable Markdown shortcut policy for the ProseMirror adapter. */
export const toggleProseMirrorKeyboardShortcut = (
  controller: ProseMirrorEditorController,
  event: KeyboardEvent,
  overrides: ShortcutOverrides
): boolean => {
  if (matchesShortcut('composer.undo', event, overrides)) {
    controller.undo();
    return true;
  }
  if (matchesShortcut('composer.redo', event, overrides)) {
    controller.redo();
    return true;
  }
  const block = BLOCK_ACTIONS.find(([id]) => matchesShortcut(id, event, overrides));
  if (block) {
    controller.applyMarkdownBlockPrefix(block[1]);
    return true;
  }
  const inline = INLINE_ACTIONS.find(([id]) => matchesShortcut(id, event, overrides));
  if (inline) {
    controller.applyMarkdownInline(inline[1]);
    return true;
  }
  return false;
};
