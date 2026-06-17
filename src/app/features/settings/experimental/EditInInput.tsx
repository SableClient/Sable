import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '$features/settings/styles.css';

export function EditInInput() {
  const [editInInput, setEditInInput] = useSetting(settingsAtom, 'editInInput');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Discord-Style Message Editing</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          focusId="experimental-edit-in-input"
          title="Edit messages in the composer"
          description="When editing a message, load its content into the main text input instead of editing inline in the timeline. Cancel with Escape or the × button."
          after={
            <Switch
              variant="Primary"
              value={editInInput}
              onChange={setEditInInput}
              title={editInInput ? 'Disable edit in composer' : 'Enable edit in composer'}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
