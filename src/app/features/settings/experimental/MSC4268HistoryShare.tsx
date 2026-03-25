import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';

export function MSC4268HistoryShare() {
  const [enabledMSC4268Command, setEnabledMSC4268Command] = useSetting(
    settingsAtom,
    'enableMSC4268CMD'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Enable Sharing of Encrypted History</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title="Enable the /sharehistory command"
          description="If enabled, this command will allow users to share encrypted history with other newly joined users, as per MSC4268."
          after={
            <Switch
              variant="Primary"
              value={enabledMSC4268Command}
              onChange={setEnabledMSC4268Command}
              title={
                enabledMSC4268Command
                  ? 'Disable /sharehistory command'
                  : 'Enable /sharehistory command'
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
