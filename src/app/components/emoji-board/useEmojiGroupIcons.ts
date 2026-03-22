import { useMemo, ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { CameraIcon } from '@phosphor-icons/react/dist/csr/Camera';
import { CoffeeIcon } from '@phosphor-icons/react/dist/csr/Coffee';
import { FlagIcon } from '@phosphor-icons/react/dist/csr/Flag';
import { LeafIcon } from '@phosphor-icons/react/dist/csr/Leaf';
import { LightbulbIcon } from '@phosphor-icons/react/dist/csr/Lightbulb';
import { PeaceIcon } from '@phosphor-icons/react/dist/csr/Peace';
import { SmileyIcon } from '@phosphor-icons/react/dist/csr/Smiley';
import { SoccerBallIcon } from '@phosphor-icons/react/dist/csr/SoccerBall';

import { EmojiGroupId } from '$plugins/emoji';

export type IEmojiGroupIcons = Record<EmojiGroupId, ComponentType<IconProps>>;

export const useEmojiGroupIcons = (): IEmojiGroupIcons =>
  useMemo(
    () => ({
      [EmojiGroupId.People]: SmileyIcon,
      [EmojiGroupId.Nature]: LeafIcon,
      [EmojiGroupId.Food]: CoffeeIcon,
      [EmojiGroupId.Activity]: SoccerBallIcon,
      [EmojiGroupId.Travel]: CameraIcon,
      [EmojiGroupId.Object]: LightbulbIcon,
      [EmojiGroupId.Symbol]: PeaceIcon,
      [EmojiGroupId.Flag]: FlagIcon,
    }),
    []
  );
