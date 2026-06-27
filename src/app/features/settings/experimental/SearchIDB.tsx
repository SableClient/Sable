import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';

export function SearchIDBToggle() {
  const [enabledIdbSearchIndex, setEnabledIdbSearchIndex] = useSetting(
    settingsAtom,
    'idbSearchIndex'
  );
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Enable Local Message Indexing</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title="Enable Local Message Indexing"
          focusId="local-message-indexing"
          description="If enabled, this will index all of your messages locally, allowing you to search through them."
          after={
            <Switch
              variant="Primary"
              value={enabledIdbSearchIndex}
              onChange={setEnabledIdbSearchIndex}
              title={
                enabledIdbSearchIndex
                  ? 'Disable indexedDB message index'
                  : 'Enable indexedDB message index'
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
