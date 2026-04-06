import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';

export function MSC4438MessageBookmarks() {
  const [enableMessageBookmarks, setEnableMessageBookmarks] = useSetting(
    settingsAtom,
    'enableMessageBookmarks'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Message Bookmarks</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Enable Message Bookmarks (MSC4438)"
          description={
            <>
              Save individual messages for later. Bookmarks are synced across all your devices via
              account data.{' '}
              <a
                href="https://github.com/matrix-org/matrix-spec-proposals/pull/4438"
                target="_blank"
                rel="noreferrer"
              >
                MSC4438
              </a>
              .{' '}
              <a
                href="https://github.com/SableClient/Sable/issues/600"
                target="_blank"
                rel="noreferrer"
              >
                Known issues (Sable GitHub)
              </a>
              .
            </>
          }
          after={
            <Switch
              variant="Primary"
              value={enableMessageBookmarks}
              onChange={setEnableMessageBookmarks}
              title={
                enableMessageBookmarks ? 'Disable message bookmarks' : 'Enable message bookmarks'
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
