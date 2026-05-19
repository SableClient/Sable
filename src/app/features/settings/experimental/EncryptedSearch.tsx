import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useClientConfig } from '$hooks/useClientConfig';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';

export function EncryptedSearch() {
  const { features } = useClientConfig();
  const [encryptedSearch, setEncryptedSearch] = useSetting(settingsAtom, 'encryptedSearch');

  // If the operator has explicitly disabled this in config.json, hide the toggle.
  if (features?.encryptedSearch === false) return null;

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Encrypted Room Search</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          focusId="encrypted-room-search"
          title="Search encrypted rooms"
          description="Search messages in encrypted rooms using your locally cached messages. Results are limited to what your device has already received."
          after={
            <Switch
              variant="Primary"
              value={encryptedSearch}
              onChange={setEncryptedSearch}
              title={encryptedSearch ? 'Disable encrypted room search' : 'Enable encrypted room search'}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
