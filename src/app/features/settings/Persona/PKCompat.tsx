import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';

export function PKCompatSettings() {
  const [usePKCompat, setUsePKCompat] = useSetting(settingsAtom, 'pkCompat');
  const [usePmpProxying, setUsePmpProxying] = useSetting(settingsAtom, 'pmpProxying');
  const [usePmpLatching, setUsePmpLatching] = useSetting(settingsAtom, 'pmpLatching');
  const [usePmpNoFallback, setUsePmpNoFallback] = useSetting(settingsAtom, 'pmpNoFallback');

  return (
    <>
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
        </SequenceCard>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="100"
        >
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
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="100"
        >
          <SettingTile
            focusId="enable-pk-latching"
            title="Enable Shorthand Latching"
            description="If enabled, you change a room's persona when you use a shorthand."
            after={
              <Switch
                variant="Primary"
                value={usePmpLatching}
                onChange={setUsePmpLatching}
                title={
                  usePmpLatching
                    ? 'disable latching when using a shorthand'
                    : 'enable latching when using a shorthand'
                }
              />
            }
          />
        </SequenceCard>
      </Box>
      <Box direction="Column" gap="100">
        <Text size="L400">General Behavior</Text>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="100"
        >
          <SettingTile
            focusId="prevent-sending-pmp-fallback"
            title="Prevent sending Persona fallback"
            description="If enabled, your messages will not include a prefix with your name to show clients that do not support Personas."
            after={
              <Switch
                variant="Primary"
                value={usePmpNoFallback}
                onChange={setUsePmpNoFallback}
                title={
                  usePmpNoFallback
                    ? 'do not prevent fallbacks when sending a persona attached message'
                    : 'prevent fallbacks when sending a persona attached message'
                }
              />
            }
          />
        </SequenceCard>
      </Box>
    </>
  );
}
