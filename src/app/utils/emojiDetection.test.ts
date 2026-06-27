import { describe, it, expect } from 'vitest';
import { isEmojiGrapheme, isJumboEmojiText, splitEmojiText } from './emojiDetection';

describe('isEmojiGrapheme', () => {
  it.each(['🫩', '🫪', '🫯', '🇩🇪', '🙂‍↔️', '™️'])('matches emoji grapheme %s', (emoji) => {
    expect(isEmojiGrapheme(emoji)).toBe(true);
  });

  it.each(['a', '12', 'http'])('does not match plain text segment %s', (value) => {
    expect(isEmojiGrapheme(value)).toBe(false);
  });
});

describe('splitEmojiText', () => {
  it('preserves newer emoji as standalone parts', () => {
    expect(splitEmojiText('a🫪b')).toEqual([
      { type: 'text', value: 'a' },
      { type: 'emoji', value: '🫪' },
      { type: 'text', value: 'b' },
    ]);
  });

  it('keeps emoji sequences whole', () => {
    expect(splitEmojiText('🙂‍↔️')).toEqual([
      { type: 'text', value: '' },
      { type: 'emoji', value: '🙂‍↔️' },
      { type: 'text', value: '' },
    ]);
  });
});

describe('isJumboEmojiText', () => {
  it.each(['🫩', '🫪', '🫯', '🇩🇪', '🙂‍↔️'])('matches modern emoji sequence %s', (emoji) => {
    expect(isJumboEmojiText(emoji)).toBe(true);
  });

  it.each(['123', 'hello', 'abc 123'])('does not match non-emoji text %s', (value) => {
    expect(isJumboEmojiText(value)).toBe(false);
  });

  it('still matches shortcode-only content', () => {
    expect(isJumboEmojiText(':blobcat:')).toBe(true);
  });
});
