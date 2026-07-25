import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';

export function PickerPageSettings() {
  const [usePmpPicker, setUsePmpPicker] = useSetting(settingsAtom, 'pmpPicker');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Persona Picker</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          focusId="enable-pmp-picker"
          title="Enable Persona Picker"
          description="Enables a menu in the editor to pick an associated persona for that room."
          after={
            <Switch
              variant="Primary"
              value={usePmpPicker}
              onChange={setUsePmpPicker}
              title={usePmpPicker ? 'disable persona picker' : 'enable persona picker'}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
