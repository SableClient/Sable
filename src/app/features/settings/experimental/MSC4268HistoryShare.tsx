import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';
import { t } from 'i18next';

export function MSC4268HistoryShare() {
  const [enabledMSC4268Command, setEnabledMSC4268Command] = useSetting(
    settingsAtom,
    'enableMSC4268CMD'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('Settings.enable_sharing_of_encrypted_history')}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title={t('Settings.enable_the_sharehistory_command')}
          focusId="sharehistory-command"
          description={t('Settings.if_enabled_this_command_will_allow_users_to_share_encrypted_history_with_ot')}
          after={
            <Switch
              variant="Primary"
              value={enabledMSC4268Command}
              onChange={setEnabledMSC4268Command}
              title={
                enabledMSC4268Command
                  ? t('Settings.disable_sharehistory_command')
                  : t('Settings.enable_sharehistory_command')
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
