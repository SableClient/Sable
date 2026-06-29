import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Text } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useSearchIndex } from '$hooks/useSearchIndex';
import type { SearchIndexState } from '$hooks/useSearchIndex';
import { SequenceCardStyle } from '$features/settings/styles.css';

export function SearchIndexCache() {
  const [idbSearchIndex] = useSetting(settingsAtom, 'idbSearchIndex');
  const searchIndex = useSearchIndex();

  const [stats, setStats] = useState<SearchIndexState | null>(null);
  const [clearing, setClearing] = useState(false);

  const refreshStats = useCallback(async () => {
    if (!searchIndex?.ready) return;
    const s = await searchIndex.state();
    setStats(s);
  }, [searchIndex]);

  useEffect(() => {
    void refreshStats();
    const id = window.setInterval(() => void refreshStats(), 5000);
    return () => window.clearInterval(id);
  }, [refreshStats]);

  const handleClear = useCallback(async () => {
    if (!searchIndex) return;
    setClearing(true);
    await searchIndex.clearIndex();
    setStats(null);
    setClearing(false);
  }, [searchIndex]);

  if (!idbSearchIndex) return null;

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Message Search Index</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Index status"
          focusId="search-index-status"
          description={
            searchIndex?.ready
              ? `Ready: ${stats?.indexedEventsCount ?? '…'} events across ${stats?.roomCount ?? '…'} rooms`
              : 'Initialising…'
          }
        />
        {searchIndex?.isBackfilling && (
          <SettingTile
            focusId="search-index-backfill"
            title="Backfill in progress"
            description={`Building history index in the background (${stats?.backfillingRoomCount ?? '…'} rooms remaining)…`}
          />
        )}
        {/* <SettingTile
          title="Per-room message limit"
          focusId="search-index-limit"
          description="Maximum number of messages indexed per room. Increasing this uses more storage."
          after={
            <select
              value={searchIndexMessageLimit}
              onChange={(e) => setSearchIndexMessageLimit(Number(e.target.value))}
              style={{ padding: '4px 8px', borderRadius: '4px' }}
            >
              {LIMIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          }
        /> */}
        <SettingTile
          title="Clear search index"
          focusId="search-index-clear"
          description="Removes all indexed messages from storage. The index will be rebuilt on next use."
          after={
            <Button
              onClick={() => void handleClear()}
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              disabled={clearing}
            >
              <Text size="B300">{clearing ? 'Clearing…' : 'Clear'}</Text>
            </Button>
          }
        />
      </SequenceCard>
    </Box>
  );
}
