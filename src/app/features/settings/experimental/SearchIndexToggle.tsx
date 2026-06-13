import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';

export function SearchIndexToggle() {
  const [idbSearchIndex, setIdbSearchIndex] = useSetting(settingsAtom, 'idbSearchIndex');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Message Search Index</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          focusId="encrypted-search-index"
          title="Build a local search index"
          description="Indexes messages from all rooms in the background for deeper search history and chip filters (Has: Image, File, etc.). Message bodies are stored as plain text in IndexedDB on this device — Charm does not add extra encryption, though browsers sandbox and restrict access to this storage."
          after={
            <Switch
              variant="Primary"
              value={idbSearchIndex}
              onChange={setIdbSearchIndex}
              title={
                idbSearchIndex ? 'Disable message search index' : 'Enable message search index'
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
