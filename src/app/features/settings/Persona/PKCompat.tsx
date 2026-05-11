import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';

export function PKCompatSettings() {
  const [usePKCompat, setUsePKCompat] = useSetting(settingsAtom, 'pkCompat');
  const [usePmpProxying, setUsePmpProxying] = useSetting(settingsAtom, 'pmpProxying');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Limited Compatibility with PluralKit-like functions</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          focusId="enable-pk-commands"
          title="Enable PK commands"
          description="If enabled, it will enable a few pk style commands, currently verry limited"
          after={
            <Switch
              variant="Primary"
              value={usePKCompat}
              onChange={setUsePKCompat}
              title={usePKCompat ? 'disable pk; commands' : 'enable pk; commands'}
            />
          }
        />
        <SettingTile
          focusId="enable-pk-shorthands"
          title="Enable Shorthands"
          description="If enabled, you can use shorthands to use a Persona for one message only (eg. '✨:test')"
          after={
            <Switch
              variant="Primary"
              value={usePmpProxying}
              onChange={setUsePmpProxying}
              title={
                usePmpProxying
                  ? 'disable checking typed messages for shorthands'
                  : 'enable checking typed messages for shorthands'
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
