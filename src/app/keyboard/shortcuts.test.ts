import { describe, expect, it } from 'vitest';
import {
  SHORTCUTS,
  captureShortcut,
  findShortcutConflict,
  getShortcutBinding,
  isDesktopOnlyShortcut,
  matchesShortcut,
  sanitizeShortcutOverrides,
} from './shortcuts';

const keyEvent = (key: string, init: Partial<KeyboardEvent> = {}) =>
  ({
    key,
    which: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...init,
  }) as KeyboardEvent;

describe('keyboard shortcuts', () => {
  it('resolves defaults, overrides, and disabled actions', () => {
    expect(getShortcutBinding('composer.bold', {})).toBe('mod+b');
    expect(getShortcutBinding('composer.bold', { 'composer.bold': 'alt+b' })).toBe('alt+b');
    expect(getShortcutBinding('composer.bold', { 'composer.bold': null })).toBeNull();
    expect(getShortcutBinding('app.toggleWindow', {})).toBeNull();
  });

  it('captures modifiers in a portable form', () => {
    expect(captureShortcut(keyEvent('K', { ctrlKey: true, shiftKey: true }))).toBe('mod+shift+k');
    expect(captureShortcut(keyEvent('Meta', { metaKey: true }))).toBeUndefined();
  });

  it('matches custom bindings and ignores disabled bindings', () => {
    const event = keyEvent('j', { ctrlKey: true });
    expect(matchesShortcut('composer.bold', event, { 'composer.bold': 'mod+j' })).toBe(true);
    expect(matchesShortcut('composer.bold', event, { 'composer.bold': null })).toBe(false);
  });

  it('does not run ordinary global actions in editable controls', () => {
    const input = document.createElement('input');
    const event = keyEvent('b', { ctrlKey: true, target: input });
    expect(matchesShortcut('app.openBookmarks', event, {})).toBe(false);
    expect(
      matchesShortcut('app.searchMessages', keyEvent('f', { ctrlKey: true, target: input }), {})
    ).toBe(true);
  });

  it('detects collisions only when scopes can overlap', () => {
    expect(findShortcutConflict('composer.bold', 'mod+b', {})).toBeUndefined();
    expect(findShortcutConflict('composer.bold', 'mod+f', {})?.id).toBe('app.searchMessages');
  });

  it('treats the desktop-only shortcut as colliding with every scope', () => {
    const overrides = { 'app.toggleWindow': 'mod+shift+s' } as const;
    expect(findShortcutConflict('composer.bold', 'mod+shift+s', overrides)?.id).toBe(
      'app.toggleWindow'
    );
    expect(findShortcutConflict('app.toggleWindow', 'alt+b', {})).toBeUndefined();
    expect(findShortcutConflict('app.toggleWindow', 'mod+b', {})?.id).toBe('composer.bold');
    expect(
      findShortcutConflict('app.toggleWindow', 'alt+b', { 'composer.bold': 'alt+b' })?.id
    ).toBe('composer.bold');
  });

  it('sanitizes imported overrides', () => {
    expect(
      sanitizeShortcutOverrides({
        'composer.bold': 'alt+b',
        'composer.italic': null,
        'composer.spoiler': 'not-a-real-modifier+x',
        unknown: 'mod+x',
      })
    ).toEqual({ 'composer.bold': 'alt+b', 'composer.italic': null });
  });

  it('registers the toggle-window shortcut as desktop-only', () => {
    const entry = SHORTCUTS.find((shortcut) => shortcut.id === 'app.toggleWindow');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('Global');
    expect(entry!.desktopOnly).toBe(true);
    expect(isDesktopOnlyShortcut('app.toggleWindow')).toBe(true);
    expect(isDesktopOnlyShortcut('composer.bold')).toBe(false);
  });

  it('strips desktop-only shortcuts from imported overrides', () => {
    expect(sanitizeShortcutOverrides({ 'app.toggleWindow': 'mod+x' })).toEqual({});
  });
});
