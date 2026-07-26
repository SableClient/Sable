import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';
import { useTranslation } from 'react-i18next';

export function PickerPageSettings() {
  const [usePmpPicker, setUsePmpPicker] = useSetting(settingsAtom, 'pmpPicker');
  const { t } = useTranslation(['settings/persona']);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('persona_picker')}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          focusId="enable-pmp-picker"
          title={t('enable_pmp_picker_title')}
          description={t('enable_pmp_picker_description')}
          after={
            <Switch
              variant="Primary"
              value={usePmpPicker}
              onChange={setUsePmpPicker}
              title={usePmpPicker ? t('enable_pmp_picker_disable') : t('enable_pmp_picker_enable')}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
