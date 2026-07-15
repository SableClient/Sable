/**
 * Emoji detection works on grapheme clusters, not raw code points.
 * Intl.Segmenter keeps ZWJ sequences, flags, and keycaps intact as single user-visible units.
 * Each grapheme is treated as emoji-like if it is a keycap sequence, an emoji forced by Variation Selector-16, or contains Emoji_Presentation, Extended_Pictographic, or Regional_Indicator.
 * This is intentionally broader than `\p{RGI_Emoji}` because browsers can lag on that property for newer emojis like `🫪`.
 * The goal here is UI rendering, so broad emoji-like detection is more useful than strict Unicode interchange validation.
 */

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const SHORTCODE_TOKEN_REG = /^:[^:\s]+:/u;
const EMOJI_GRAPHEME_REG =
  /[#*0-9]\uFE0F?\u20E3|\p{Emoji}\uFE0F|[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

export type EmojiTextPart =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'emoji';
      value: string;
    };

export const getFirstGrapheme = (text: string): string => {
  const first = graphemeSegmenter.segment(text)[Symbol.iterator]().next();
  return first.done ? '' : first.value.segment;
};

export const isEmojiGrapheme = (segment: string): boolean => {
  if (!segment) return false;
  return EMOJI_GRAPHEME_REG.test(segment);
};

export const splitEmojiText = (text: string): EmojiTextPart[] => {
  const parts: EmojiTextPart[] = [];
  let buffer = '';
  let foundEmoji = false;

  [...graphemeSegmenter.segment(text)].forEach(({ segment }) => {
    if (isEmojiGrapheme(segment)) {
      foundEmoji = true;
      parts.push({ type: 'text', value: buffer });
      buffer = '';
      parts.push({ type: 'emoji', value: segment });
    } else {
      buffer += segment;
    }
  });

  if (!foundEmoji) {
    return [{ type: 'text', value: buffer }];
  }

  parts.push({ type: 'text', value: buffer });
  return parts;
};

export const isJumboEmojiText = (text: string, maxTokens = 10): boolean => {
  if (!text) return false;

  let tokenCount = 0;
  let index = 0;

  while (index < text.length) {
    const remainder = text.slice(index);
    const whitespaceMatch = /^\s+/u.exec(remainder);
    if (whitespaceMatch) {
      index += whitespaceMatch[0].length;
    } else {
      const shortcodeMatch = SHORTCODE_TOKEN_REG.exec(remainder);
      if (shortcodeMatch) {
        tokenCount += 1;
        if (tokenCount > maxTokens) return false;
        index += shortcodeMatch[0].length;
      } else {
        const grapheme = getFirstGrapheme(remainder);
        if (!isEmojiGrapheme(grapheme)) return false;

        tokenCount += 1;
        if (tokenCount > maxTokens) return false;
        index += grapheme.length;
      }
    }
  }

  return tokenCount > 0;
};
