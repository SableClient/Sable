import type { MatrixClient } from '$types/matrix-sdk';

import { getAccountData } from '$utils/room';
import type { IEmoji } from './emoji';
import { emojis } from './emoji';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

type EmojiUnicode = string;
type EmojiUsageCount = number;

export type IRecentEmojiContent = {
  recent_emoji?: [EmojiUnicode, EmojiUsageCount][];
};

export const getRecentEmojis = (mx: MatrixClient, limit?: number): IEmoji[] => {
  let recentEmojiEvent = getAccountData(mx, CustomAccountDataEvent.RecentEmoji);
  let isLegacy = false;
  if (!recentEmojiEvent) {
    recentEmojiEvent = getAccountData(mx, CustomAccountDataEvent.LegacyElementRecentEmoji);
    isLegacy = true;
  }
  const recentEmoji = recentEmojiEvent?.getContent<IRecentEmojiContent>().recent_emoji;

  if (isLegacy && Array.isArray(recentEmoji)) {
    mx.setAccountData(CustomAccountDataEvent.RecentEmoji, {
      recent_emoji: recentEmoji,
    }).catch(() => {});
  }

  if (!Array.isArray(recentEmoji)) return [];

  return recentEmoji
    .toSorted((e1, e2) => e2[1] - e1[1])
    .slice(0, limit)
    .reduce<IEmoji[]>((list, [unicode]) => {
      const emoji = emojis.find((e) => e.unicode === unicode);
      if (emoji) list.push(emoji);
      return list;
    }, []);
};

export function addRecentEmoji(mx: MatrixClient, unicode: string) {
  let recentEmojiEvent = getAccountData(mx, CustomAccountDataEvent.RecentEmoji);
  if (!recentEmojiEvent) {
    recentEmojiEvent = getAccountData(mx, CustomAccountDataEvent.LegacyElementRecentEmoji);
  }
  const recentEmojiContent = recentEmojiEvent?.getContent<IRecentEmojiContent>();
  const recentEmoji =
    recentEmojiContent && Array.isArray(recentEmojiContent.recent_emoji)
      ? structuredClone(recentEmojiContent.recent_emoji)
      : [];

  const emojiIndex = recentEmoji.findIndex(([u]) => u === unicode);
  let entry: [EmojiUnicode, EmojiUsageCount];
  if (emojiIndex < 0) {
    entry = [unicode, 1];
  } else {
    const spliced = recentEmoji.splice(emojiIndex, 1);
    entry = spliced[0] ?? [unicode, 1];
    entry[1] += 1;
  }
  recentEmoji.unshift(entry);
  mx.setAccountData(CustomAccountDataEvent.RecentEmoji, {
    recent_emoji: recentEmoji.slice(0, 100),
  });
}
