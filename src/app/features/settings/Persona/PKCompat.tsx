import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Box, Switch, Text } from 'folds';
import { SequenceCardStyle } from '../styles.css';
import { t } from 'i18next';

export function PKCompatSettings() {
  const [usePKCompat, setUsePKCompat] = useSetting(settingsAtom, 'pkCompat');
  const [usePmpProxying, setUsePmpProxying] = useSetting(settingsAtom, 'pmpProxying');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('Settings.Persona.limited_compatibility_with_pluralkit_like_functions')}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          focusId="enable-pk-commands"
          title={t('Settings.Persona.enable_pk_commands')}
          description={t('Settings.Persona.if_enabled_it_will_enable_a_few_pk_style_commands_currently_verry_limited')}
          after={
            <Switch
              variant="Primary"
              value={usePKCompat}
              onChange={setUsePKCompat}
              title={usePKCompat ? t('Settings.Persona.disable_pk_commands') : t('Settings.Persona.enable_pks_commands')}
            />
          }
        />
        <SettingTile
          focusId="enable-pk-shorthands"
          title={t('Settings.Persona.enable_shorthands')}
          description={t('Settings.Persona.if_enabled_you_can_use_shorthands_to_use_a_persona_for_one_message_only_eg')}
          after={
            <Switch
              variant="Primary"
              value={usePmpProxying}
              onChange={setUsePmpProxying}
              title={
                usePmpProxying
                  ? t('Settings.Persona.disable_checking_typed_messages_for_shorthands')
                  : t('Settings.Persona.enable_checking_typed_messages_for_shorthands')
              }
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
