import { describe, expect, it } from 'vitest';
import {
  applyEmojiAutoReplacementAtEnd,
  findEmojiAutoReplacement,
  getStructuredMarkdownAction,
  shouldInsertBreakAfterStructuredReplacement,
} from './composerInputAssist';

describe('getStructuredMarkdownAction', () => {
  it('continues blockquotes', () => {
    expect(getStructuredMarkdownAction(['> quoted line'], 0)).toEqual({
      kind: 'continue',
      prefix: '> ',
    });
  });

  it('continues unordered lists', () => {
    expect(getStructuredMarkdownAction(['- item'], 0)).toEqual({
      kind: 'continue',
      prefix: '- ',
    });
  });

  it('increments ordered lists', () => {
    expect(getStructuredMarkdownAction(['2. item'], 0)).toEqual({
      kind: 'continue',
      prefix: '3. ',
    });
  });

  it('exits empty quote continuation lines', () => {
    expect(getStructuredMarkdownAction(['> '], 0)).toEqual({
      kind: 'exit',
      replacement: '',
    });
  });

  it('closes fenced code blocks from a blank line inside the fence', () => {
    expect(getStructuredMarkdownAction(['```ts', 'const x = 1;', ''], 2)).toEqual({
      kind: 'close_fence',
      replacement: '```',
    });
  });

  it('keeps enter inserting newlines inside open fenced code blocks', () => {
    expect(getStructuredMarkdownAction(['```ts', 'const x = 1;'], 1)).toEqual({
      kind: 'continue_fence',
    });
  });

  it('inserts a follow-up paragraph when exiting empty markdown structures', () => {
    expect(
      shouldInsertBreakAfterStructuredReplacement({
        kind: 'exit',
        replacement: '',
      })
    ).toBe(true);
    expect(
      shouldInsertBreakAfterStructuredReplacement({
        kind: 'close_fence',
        replacement: '```',
      })
    ).toBe(true);
    expect(
      shouldInsertBreakAfterStructuredReplacement({
        kind: 'continue',
        prefix: '- ',
      })
    ).toBe(false);
    expect(
      shouldInsertBreakAfterStructuredReplacement({
        kind: 'continue_fence',
      })
    ).toBe(false);
  });
});

describe('findEmojiAutoReplacement', () => {
  it('expands ASCII emoticons after a trailing space', () => {
    expect(findEmojiAutoReplacement('hello :) ', 'hello :) '.length)).toMatchObject({
      token: ':)',
      emoji: '🙂',
      start: 6,
      end: 9,
      replacement: '🙂 ',
    });
  });

  it('expands a heart token at the start of a line', () => {
    expect(findEmojiAutoReplacement('<3 ', 3)).toMatchObject({
      token: '<3',
      emoji: '❤️',
      start: 0,
      end: 3,
      replacement: '❤️ ',
    });
  });

  it('does not expand inside markdown code spans', () => {
    expect(findEmojiAutoReplacement('`:)` ', '`:)` '.length)).toBeNull();
  });

  it('does not expand tokens embedded in larger words', () => {
    expect(
      findEmojiAutoReplacement('https://example.com/:) ', 'https://example.com/:) '.length)
    ).toBeNull();
  });

  it('expands emoticons on tab without trimming the final token character', () => {
    expect(findEmojiAutoReplacement(':)', 2, { consumeTrailingSeparator: false })).toMatchObject({
      token: ':)',
      emoji: '🙂',
      start: 0,
      end: 2,
      replacement: '🙂',
    });
  });

  it('expands an emoticon at the end of the message on send', () => {
    expect(applyEmojiAutoReplacementAtEnd('Hello :)')).toBe('Hello 🙂');
    expect(applyEmojiAutoReplacementAtEnd('https://example.com/:)')).toBe('https://example.com/:)');
  });
});
