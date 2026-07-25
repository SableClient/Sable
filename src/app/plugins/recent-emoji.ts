import type { MatrixClient } from '$types/matrix-sdk';

import { getAccountData } from '$utils/room/hierarchy';
import type { IEmoji } from './emoji';
import { emojis } from './emoji';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

type EmojiUnicode = string;
type EmojiUsageCount = number;

type RecentEmojiEntry =
  | { emoji: EmojiUnicode; total: EmojiUsageCount }
  | [EmojiUnicode, EmojiUsageCount];

export type IRecentEmojiContent = {
  recent_emoji?: { emoji: EmojiUnicode; total: EmojiUsageCount }[];
};

const isTuple = (entry: RecentEmojiEntry): entry is [EmojiUnicode, EmojiUsageCount] =>
  Array.isArray(entry) &&
  entry.length === 2 &&
  typeof entry[0] === 'string' &&
  typeof entry[1] === 'number';

const isValidEntry = (
  entry: RecentEmojiEntry
): entry is { emoji: EmojiUnicode; total: EmojiUsageCount } =>
  typeof entry === 'object' &&
  entry !== null &&
  !Array.isArray(entry) &&
  typeof (entry as { emoji?: unknown }).emoji === 'string' &&
  typeof (entry as { total?: unknown }).total === 'number';

const normalizeEntries = (
  raw: RecentEmojiEntry[]
): { emoji: EmojiUnicode; total: EmojiUsageCount }[] =>
  raw
    .map((entry) => {
      if (isTuple(entry)) return { emoji: entry[0], total: entry[1] };
      if (isValidEntry(entry)) return { emoji: entry.emoji, total: entry.total };
      return null;
    })
    .filter((e): e is { emoji: EmojiUnicode; total: EmojiUsageCount } => e !== null);

export const getRecentEmojis = (mx: MatrixClient, limit?: number): IEmoji[] => {
  let recentEmojiEvent = getAccountData(mx, CustomAccountDataEvent.RecentEmoji);
  let isLegacy = false;
  if (!recentEmojiEvent) {
    recentEmojiEvent = getAccountData(mx, CustomAccountDataEvent.LegacyElementRecentEmoji);
    isLegacy = true;
  }
  const raw = recentEmojiEvent?.getContent<IRecentEmojiContent>().recent_emoji;

  if (!Array.isArray(raw)) return [];

  const hasTuples = raw.some((e) => isTuple(e as RecentEmojiEntry));
  const entries = normalizeEntries(raw as RecentEmojiEntry[]);

  if ((isLegacy || hasTuples) && entries.length > 0) {
    mx.setAccountData(CustomAccountDataEvent.RecentEmoji, {
      recent_emoji: entries,
    }).catch(() => {});
  }

  return entries
    .toSorted((a, b) => b.total - a.total)
    .slice(0, limit)
    .reduce<IEmoji[]>((list, { emoji: unicode }) => {
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
  const raw = recentEmojiEvent?.getContent<IRecentEmojiContent>().recent_emoji;
  const recentEmoji = Array.isArray(raw) ? normalizeEntries(raw as RecentEmojiEntry[]) : [];

  const existingIndex = recentEmoji.findIndex((e) => e.emoji === unicode);
  if (existingIndex < 0) {
    recentEmoji.unshift({ emoji: unicode, total: 1 });
  } else {
    const [entry] = recentEmoji.splice(existingIndex, 1);
    if (entry) {
      entry.total += 1;
      recentEmoji.unshift(entry);
    } else {
      recentEmoji.unshift({ emoji: unicode, total: 1 });
    }
  }

  mx.setAccountData(CustomAccountDataEvent.RecentEmoji, {
    recent_emoji: recentEmoji.slice(0, 100),
  });
}
