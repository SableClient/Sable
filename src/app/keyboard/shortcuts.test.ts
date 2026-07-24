import { describe, expect, it } from 'vitest';
import {
  captureShortcut,
  findShortcutConflict,
  getShortcutBinding,
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
});
