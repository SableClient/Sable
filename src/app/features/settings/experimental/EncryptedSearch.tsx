import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useClientConfig } from '$hooks/useClientConfig';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '$features/settings/styles.css';

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
          description="Search your locally decrypted message history in encrypted rooms. Results come from your device’s in-memory event cache — nothing is written to disk by this option. Results are limited to recently received messages."
          after={
            <Switch
              variant="Primary"
              value={encryptedSearch}
              onChange={setEncryptedSearch}
              title={
                encryptedSearch ? 'Disable encrypted room search' : 'Enable encrypted room search'
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
