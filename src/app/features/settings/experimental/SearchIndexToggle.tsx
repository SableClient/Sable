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
      <Text size="L400">Encrypted Search Index</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          focusId="encrypted-search-index"
          title="Build a local search index for encrypted rooms"
          description="Indexes encrypted room messages in the background for faster, deeper search results across your full history. Uses IndexedDB storage — see Developer Tools › Cache for usage."
          after={
            <Switch
              variant="Primary"
              value={idbSearchIndex}
              onChange={setIdbSearchIndex}
              title={
                idbSearchIndex ? 'Disable encrypted search index' : 'Enable encrypted search index'
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
