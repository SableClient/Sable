import { Box, Text, Chip } from 'folds';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { copyToClipboard } from '$utils/dom';
import { SequenceCardStyle } from '$features/settings/styles.css';

export function MatrixId() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Matrix ID</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={userId}
          focusId="matrix-id"
          after={
            <Chip variant="Secondary" radii="Pill" onClick={() => copyToClipboard(userId)}>
              <Text size="T200">Copy</Text>
            </Chip>
          }
        />
      </SequenceCard>
    </Box>
  );
}
