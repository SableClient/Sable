import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';
import { useTranslation } from 'react-i18next';

export function MSC4274MediaGalleries() {
  const [enabledMediaGalleries, setEnabledMediaGalleries] = useSetting(
    settingsAtom,
    'enableMediaGalleries'
  );
  const { t } = useTranslation(['settings/experimental']);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('enable_media_galleries_support')}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title={t('enable_media_galleries_title')}
          focusId="media-galleries"
          description={t('enable_media_galleries_description')}
          after={
            <Switch
              variant="Primary"
              value={enabledMediaGalleries}
              onChange={setEnabledMediaGalleries}
              title={
                enabledMediaGalleries ? t('disable_media_galleries') : t('enable_media_galleries')
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
