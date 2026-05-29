import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';
import { t } from 'i18next';

export function BandwidthSavingEmojis() {
  const [useBandwidthSaving, setUseBandwidthSaving] = useSetting(
    settingsAtom,
    'saveStickerEmojiBandwidth'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('Settings.save_bandwidth_for_sticker_and_emoji_images')}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title={t('Settings.enable_bandwidth_saving_for_stickers_and_emojis')}
          focusId="bandwidth-saving-emojis"
          description={t('Settings.if_enabled_sticker_and_emoji_images_will_be_optimized_to_save_bandwidth_thi')}
          after={
            <Switch variant="Primary" value={useBandwidthSaving} onChange={setUseBandwidthSaving} />
          }
        />
      </SequenceCard>
    </Box>
  );
}
