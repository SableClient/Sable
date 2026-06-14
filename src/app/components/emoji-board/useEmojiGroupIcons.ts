import { useMemo } from 'react';

import { EmojiGroupId } from '$plugins/emoji';
import { Icons } from '$app/icons';
import type { IconSrc } from '$app/icons';

export type IEmojiGroupIcons = Record<EmojiGroupId, IconSrc>;

export const useEmojiGroupIcons = (): IEmojiGroupIcons =>
  useMemo(
    () => ({
      [EmojiGroupId.People]: Icons.Smile,
      [EmojiGroupId.Nature]: Icons.Leaf,
      [EmojiGroupId.Food]: Icons.Cup,
      [EmojiGroupId.Activity]: Icons.Ball,
      [EmojiGroupId.Travel]: Icons.Photo,
      [EmojiGroupId.Object]: Icons.Bulb,
      [EmojiGroupId.Symbol]: Icons.Peace,
      [EmojiGroupId.Flag]: Icons.Flag,
    }),
    []
  );
