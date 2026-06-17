import { describe, expect, it } from 'vitest';

import {
  buildMessageDiffDisplay,
  collapseEqualLineRuns,
  diffLinesRaw,
  diffWords,
  type MessageDiffDisplay,
} from './textDiff';

const partValues = (parts: ReturnType<typeof diffWords>) =>
  parts.map((part) => `${part.type}:${JSON.stringify(part.value)}`);

describe('diffWords', () => {
  it('returns empty for identical empty strings', () => {
    expect(diffWords('', '')).toEqual([]);
  });

  it('returns equal part for identical text', () => {
    expect(diffWords('hello world', 'hello world')).toEqual([
      { type: 'equal', value: 'hello world' },
    ]);
  });

  it('marks inserted words', () => {
    expect(partValues(diffWords('hello', 'hello world'))).toEqual([
      'equal:"hello"',
      'insert:" world"',
    ]);
  });

  it('marks deleted words', () => {
    expect(partValues(diffWords('hello world', 'hello'))).toEqual([
      'equal:"hello"',
      'delete:" world"',
    ]);
  });

  it('marks replaced words inline', () => {
    expect(partValues(diffWords('hello world', 'hello there'))).toEqual([
      'equal:"hello "',
      'delete:"world"',
      'insert:"there"',
    ]);
  });
});

describe('collapseEqualLineRuns', () => {
  it('keeps one context line before changes', () => {
    const equalLines = Array.from({ length: 8 }, (_, i) => `line ${i + 1}`);
    const rows = collapseEqualLineRuns([
      { type: 'equal', lines: equalLines },
      { type: 'delete', lines: ['old'] },
      { type: 'insert', lines: ['new'] },
    ]);

    expect(rows).toEqual([
      {
        type: 'skip',
        lines: ['line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7'],
        placement: 'before',
      },
      { type: 'equal', text: 'line 8' },
      { type: 'delete', text: 'old' },
      { type: 'insert', text: 'new' },
    ]);
  });

  it('keeps one context line after changes', () => {
    const equalLines = Array.from({ length: 5 }, (_, i) => `line ${i + 1}`);
    const rows = collapseEqualLineRuns([
      { type: 'delete', lines: ['old'] },
      { type: 'insert', lines: ['new'] },
      { type: 'equal', lines: equalLines },
    ]);

    expect(rows).toEqual([
      { type: 'delete', text: 'old' },
      { type: 'insert', text: 'new' },
      { type: 'equal', text: 'line 1' },
      {
        type: 'skip',
        lines: ['line 2', 'line 3', 'line 4', 'line 5'],
        placement: 'after',
      },
    ]);
  });
});

describe('buildMessageDiffDisplay', () => {
  it('uses inline word diff for single-line edits', () => {
    const display = buildMessageDiffDisplay('hello', 'hello world');
    expect(display).toEqual({
      mode: 'inline',
      parts: diffWords('hello', 'hello world'),
    });
  });

  it('uses line diff with collapse for multiline edits', () => {
    const oldText = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'old'].join('\n');
    const newText = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'new'].join('\n');

    const display = buildMessageDiffDisplay(oldText, newText);
    expect(display.mode).toBe('lines');
    const linesDisplay = display as Extract<MessageDiffDisplay, { mode: 'lines' }>;
    expect(linesDisplay).toMatchObject({
      mode: 'lines',
      rows: expect.arrayContaining([
        { type: 'delete', text: 'old' },
        { type: 'insert', text: 'new' },
      ]),
    });
    expect(linesDisplay.rows.at(-2)).toEqual({ type: 'delete', text: 'old' });
    expect(linesDisplay.rows.at(-1)).toEqual({ type: 'insert', text: 'new' });
  });

  it('collapses unchanged lines in multiline diffs', () => {
    const unchanged = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    const oldText = `${unchanged}\nold tail`;
    const newText = `${unchanged}\nnew tail`;

    const display = buildMessageDiffDisplay(oldText, newText);
    expect(display.mode).toBe('lines');
    const linesDisplay = display as Extract<MessageDiffDisplay, { mode: 'lines' }>;
    expect(linesDisplay.rows.some((row) => row.type === 'skip')).toBe(true);
  });
});

describe('diffLinesRaw', () => {
  it('marks replaced lines', () => {
    expect(diffLinesRaw('one\ntwo', 'one\nthree')).toEqual([
      { type: 'equal', lines: ['one'] },
      { type: 'delete', lines: ['two'] },
      { type: 'insert', lines: ['three'] },
    ]);
  });
});
