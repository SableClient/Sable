import type { CSSProperties } from 'react';
import { Badge, Box, Text } from 'folds';
import { EmojiBoardTab } from '$components/emoji-board/types';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

const styles: CSSProperties = {
  cursor: 'pointer',
};

export function EmojiBoardTabs({
  tab,
  onTabChange,
}: {
  tab: EmojiBoardTab;
  onTabChange: (tab: EmojiBoardTab) => void;
}) {
  const [showGifPicker] = useSetting(settingsAtom, 'enableGifPicker');
  return (
    <Box gap="100">
      {showGifPicker && (
        <Badge
          style={styles}
          as="button"
          variant="Secondary"
          fill={tab === EmojiBoardTab.Gif ? 'Solid' : 'None'}
          size="500"
          onClick={() => onTabChange(EmojiBoardTab.Gif)}
        >
          <Text as="span" size="L400">
            GIF
          </Text>
        </Badge>
      )}
      <Badge
        style={styles}
        as="button"
        variant="Secondary"
        fill={tab === EmojiBoardTab.Sticker ? 'Solid' : 'None'}
        size="500"
        onClick={() => onTabChange(EmojiBoardTab.Sticker)}
      >
        <Text as="span" size="L400">
          Sticker
        </Text>
      </Badge>
      <Badge
        style={styles}
        as="button"
        variant="Secondary"
        fill={tab === EmojiBoardTab.Emoji ? 'Solid' : 'None'}
        size="500"
        onClick={() => onTabChange(EmojiBoardTab.Emoji)}
      >
        <Text as="span" size="L400">
          Emoji
        </Text>
      </Badge>
    </Box>
  );
}
