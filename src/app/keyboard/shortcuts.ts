import { isKeyHotkey, parseHotkey } from 'is-hotkey';
import type { KeyboardEventLike } from 'is-hotkey';

type ShortcutEvent = KeyboardEventLike & { target?: EventTarget | null };

export type ShortcutScope = 'global' | 'composer';

export type ShortcutId =
  | 'app.searchMessages'
  | 'app.openBookmarks'
  | 'app.createRoom'
  | 'navigation.nextUnread'
  | 'navigation.cycleNextUnread'
  | 'navigation.cyclePreviousUnread'
  | 'navigation.openRoomSearch'
  | 'navigation.nextReply'
  | 'navigation.previousReply'
  | 'composer.undo'
  | 'composer.redo'
  | 'composer.bold'
  | 'composer.italic'
  | 'composer.underline'
  | 'composer.strikethrough'
  | 'composer.inlineCode'
  | 'composer.spoiler'
  | 'composer.heading1'
  | 'composer.heading2'
  | 'composer.heading3'
  | 'composer.blockquote'
  | 'composer.codeBlock'
  | 'composer.orderedList'
  | 'composer.unorderedList'
  | 'composer.openStickerPicker';

export type ShortcutOverrides = Partial<Record<ShortcutId, string | null>>;

export type ShortcutDefinition = {
  id: ShortcutId;
  label: string;
  category: 'General' | 'Navigation' | 'Messages';
  defaultBinding: string;
  scope: ShortcutScope;
  allowInEditable?: boolean;
};

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: 'app.searchMessages',
    label: 'Search for messages',
    category: 'General',
    defaultBinding: 'mod+f',
    scope: 'global',
    allowInEditable: true,
  },
  {
    id: 'app.openBookmarks',
    label: 'Open bookmarks',
    category: 'General',
    defaultBinding: 'mod+shift+b',
    scope: 'global',
  },
  {
    id: 'app.createRoom',
    label: 'Create a room',
    category: 'General',
    defaultBinding: 'mod+shift+n',
    scope: 'global',
  },
  {
    id: 'navigation.nextUnread',
    label: 'Jump to the highest-priority unread room',
    category: 'Navigation',
    defaultBinding: 'alt+n',
    scope: 'global',
  },
  {
    id: 'navigation.cycleNextUnread',
    label: 'Go to next unread room (cycle)',
    category: 'Navigation',
    defaultBinding: 'alt+shift+down',
    scope: 'global',
  },
  {
    id: 'navigation.cyclePreviousUnread',
    label: 'Go to previous unread room (cycle)',
    category: 'Navigation',
    defaultBinding: 'alt+shift+up',
    scope: 'global',
  },
  {
    id: 'navigation.openRoomSearch',
    label: 'Search and go to room',
    category: 'Navigation',
    defaultBinding: 'mod+k',
    scope: 'global',
    allowInEditable: true,
  },
  {
    id: 'navigation.nextReply',
    label: 'Target next message to reply to',
    category: 'Navigation',
    defaultBinding: 'mod+down',
    scope: 'global',
    allowInEditable: true,
  },
  {
    id: 'navigation.previousReply',
    label: 'Target previous message to reply to',
    category: 'Navigation',
    defaultBinding: 'mod+up',
    scope: 'global',
    allowInEditable: true,
  },
  {
    id: 'composer.undo',
    label: 'Undo in message editor',
    category: 'Messages',
    defaultBinding: 'mod+z',
    scope: 'composer',
  },
  {
    id: 'composer.redo',
    label: 'Redo in message editor',
    category: 'Messages',
    defaultBinding: 'mod+shift+z',
    scope: 'composer',
  },
  {
    id: 'composer.bold',
    label: 'Bold',
    category: 'Messages',
    defaultBinding: 'mod+b',
    scope: 'composer',
  },
  {
    id: 'composer.italic',
    label: 'Italic',
    category: 'Messages',
    defaultBinding: 'mod+i',
    scope: 'composer',
  },
  {
    id: 'composer.underline',
    label: 'Underline',
    category: 'Messages',
    defaultBinding: 'mod+u',
    scope: 'composer',
  },
  {
    id: 'composer.strikethrough',
    label: 'Strikethrough',
    category: 'Messages',
    defaultBinding: 'mod+s',
    scope: 'composer',
  },
  {
    id: 'composer.inlineCode',
    label: 'Inline code',
    category: 'Messages',
    defaultBinding: 'mod+[',
    scope: 'composer',
  },
  {
    id: 'composer.spoiler',
    label: 'Spoiler',
    category: 'Messages',
    defaultBinding: 'mod+h',
    scope: 'composer',
  },
  {
    id: 'composer.heading1',
    label: 'Heading 1',
    category: 'Messages',
    defaultBinding: 'mod+1',
    scope: 'composer',
  },
  {
    id: 'composer.heading2',
    label: 'Heading 2',
    category: 'Messages',
    defaultBinding: 'mod+2',
    scope: 'composer',
  },
  {
    id: 'composer.heading3',
    label: 'Heading 3',
    category: 'Messages',
    defaultBinding: 'mod+3',
    scope: 'composer',
  },
  {
    id: 'composer.blockquote',
    label: 'Block quote',
    category: 'Messages',
    defaultBinding: "mod+'",
    scope: 'composer',
  },
  {
    id: 'composer.codeBlock',
    label: 'Code block',
    category: 'Messages',
    defaultBinding: 'mod+;',
    scope: 'composer',
  },
  {
    id: 'composer.orderedList',
    label: 'Ordered list',
    category: 'Messages',
    defaultBinding: 'mod+7',
    scope: 'composer',
  },
  {
    id: 'composer.unorderedList',
    label: 'Unordered list',
    category: 'Messages',
    defaultBinding: 'mod+8',
    scope: 'composer',
  },
  {
    id: 'composer.openStickerPicker',
    label: 'Open sticker picker',
    category: 'Messages',
    defaultBinding: 'control+e',
    scope: 'composer',
  },
] as const;

const SHORTCUT_IDS = new Set<ShortcutId>(SHORTCUTS.map(({ id }) => id));
const SHORTCUT_BY_ID = new Map(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]));

export const getShortcutBinding = (id: ShortcutId, overrides: ShortcutOverrides): string | null => {
  const override = overrides[id];
  return override === undefined ? SHORTCUT_BY_ID.get(id)!.defaultBinding : override;
};

const editableEventTarget = (event: ShortcutEvent): boolean => {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  );
};

export const matchesShortcut = (
  id: ShortcutId,
  event: ShortcutEvent,
  overrides: ShortcutOverrides
): boolean => {
  const shortcut = SHORTCUT_BY_ID.get(id)!;
  if (shortcut.scope === 'global' && !shortcut.allowInEditable && editableEventTarget(event))
    return false;
  const binding = getShortcutBinding(id, overrides);
  return binding !== null && isKeyHotkey(binding, event);
};

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  escape: 'Esc',
  control: 'Ctrl',
  meta: 'Meta',
};

export const formatShortcut = (binding: string | null): string => {
  if (binding === null) return 'Unassigned';
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return binding
    .split('+')
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'mod') return isMac ? '⌘' : 'Ctrl';
      if (lower === 'alt') return isMac ? '⌥' : 'Alt';
      if (lower === 'shift') return isMac ? '⇧' : 'Shift';
      return KEY_NAMES[lower] ?? (part.length === 1 ? part.toUpperCase() : part);
    })
    .join('+');
};

export const captureShortcut = (event: ShortcutEvent): string | undefined => {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return undefined;
  const key = event.key === ' ' ? 'space' : event.key.toLowerCase();
  const modifiers: string[] = [];
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  if (event.metaKey) modifiers.push(isMac ? 'mod' : 'meta');
  if (event.ctrlKey) modifiers.push(isMac ? 'control' : 'mod');
  if (event.altKey) modifiers.push('alt');
  if (event.shiftKey) modifiers.push('shift');
  return [...modifiers, key].join('+');
};

export const findShortcutConflict = (
  id: ShortcutId,
  binding: string,
  overrides: ShortcutOverrides
): ShortcutDefinition | undefined => {
  const current = SHORTCUT_BY_ID.get(id)!;
  return SHORTCUTS.find((candidate) => {
    if (candidate.id === id || getShortcutBinding(candidate.id, overrides) !== binding)
      return false;
    return (
      current.scope === candidate.scope ||
      (current.scope === 'composer' && candidate.allowInEditable) ||
      (candidate.scope === 'composer' && current.allowInEditable)
    );
  });
};

export const sanitizeShortcutOverrides = (value: unknown): ShortcutOverrides | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: ShortcutOverrides = {};
  for (const [id, binding] of Object.entries(value)) {
    if (!SHORTCUT_IDS.has(id as ShortcutId)) continue;
    if (binding === null) result[id as ShortcutId] = null;
    else if (typeof binding === 'string' && binding.length > 0 && binding.length <= 64) {
      try {
        parseHotkey(binding, { byKey: true });
        result[id as ShortcutId] = binding;
      } catch {
        // Ignore malformed imported bindings.
      }
    }
  }
  return result;
};
