import { describe, expect, it } from 'vitest';
import { findEmojiAutoReplacement, getStructuredMarkdownAction } from './composerInputAssist';

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
});
