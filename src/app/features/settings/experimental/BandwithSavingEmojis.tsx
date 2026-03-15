import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';

export function BandwidthSavingEmojis() {
  const [useBandwidthSaving, setUseBandwidthSaving] = useSetting(
    settingsAtom,
    'saveStickerEmojiBandwidth'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Save Bandwidth for Sticker and Emoji Images</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title="Enable bandwidth saving for stickers and emojis"
          description="If enabled, sticker and emoji images will be optimized to save bandwidth. This helps reduce data usage when viewing these images. But will increase server computation load."
          after={
            <Switch variant="Primary" value={useBandwidthSaving} onChange={setUseBandwidthSaving} />
          }
        />
      </SequenceCard>
    </Box>
  );
}
