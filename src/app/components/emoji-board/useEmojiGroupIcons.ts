import { useMemo } from 'react';

import { EmojiGroupId } from '$plugins/emoji';
import type { PhosphorIcon } from '$components/icons/phosphor';
import {
  Basketball,
  Coffee,
  Flag,
  Image,
  Leaf,
  Lightbulb,
  Peace,
  Smiley,
} from '$components/icons/phosphor';

export type IEmojiGroupIcons = Record<EmojiGroupId, PhosphorIcon>;

export const useEmojiGroupIcons = (): IEmojiGroupIcons =>
  useMemo(
    () => ({
      [EmojiGroupId.People]: Smiley,
      [EmojiGroupId.Nature]: Leaf,
      [EmojiGroupId.Food]: Coffee,
      [EmojiGroupId.Activity]: Basketball,
      [EmojiGroupId.Travel]: Image,
      [EmojiGroupId.Object]: Lightbulb,
      [EmojiGroupId.Symbol]: Peace,
      [EmojiGroupId.Flag]: Flag,
    }),
    []
  );
