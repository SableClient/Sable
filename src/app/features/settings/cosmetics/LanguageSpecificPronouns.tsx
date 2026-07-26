import { Box, Input, Switch, Text } from 'folds';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';
import { useEffect, useState } from 'react';
import { getSettings, setSettings } from '$state/settings';
import { SequenceCardStyle } from '../styles.css';
import { useTranslation } from 'react-i18next';

export type LanguageSpecificPronounsConfig = {
  enabled?: boolean | string;
  languages?: string[];
};

export const resolveLanguageSpecificPronounsEnabled = (
  enabled: LanguageSpecificPronounsConfig['enabled']
): boolean => {
  if (enabled === undefined) return false;
  if (typeof enabled === 'boolean') return enabled;
  const normalized = enabled.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no')
    return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes')
    return true;
  return false;
};

// utility function to split a comma separated list of languages and trim whitespace
function splitAndTrimLanguages(languages: string): string[] {
  return languages
    .split(',')
    .map((lang) => lang.trim())
    .filter((lang) => lang.length > 0);
}

// MSC4247 allows users to set pronouns in different languages
export function LanguageSpecificPronouns() {
  const [useLanguageSpecificPronouns, setEnabled] = useState(false);
  const [languageList, setLanguageList] = useState('');
  const { t } = useTranslation(['settings/appearance']);

  // common handler for saving changes to the language specific pronouns settings
  const handleSave = (enabled: boolean, languages: string) => {
    const currentSettings = getSettings();
    setSettings({
      ...currentSettings,
      filterPronounsBasedOnLanguage: enabled,
      filterPronounsLanguages: splitAndTrimLanguages(languages),
    });
  };

  // handler for when the language list input changes
  const handleLanguageListChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setLanguageList(val);
    // save the new language list to the client config, keeping the enabled state unchanged
    handleSave(getSettings().filterPronounsBasedOnLanguage ?? false, val);
  };

  useEffect(() => {
    setEnabled(
      resolveLanguageSpecificPronounsEnabled(getSettings().filterPronounsBasedOnLanguage ?? false)
    );
    setLanguageList(getSettings().filterPronounsLanguages?.join(',') || '');
  }, []);

  // handler for toggling the enabled state of language specific pronouns
  const handleSetEnabled = (enabled: boolean) => {
    handleSave(enabled, getSettings().filterPronounsLanguages?.join(',') || '');
    setEnabled(enabled);
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('language_specific_pronouns')}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title={t('show_pronouns_only_in_selected_language_title')}
          focusId="show-pronouns-only-in-selected-language"
          description={t('show_pronouns_only_in_selected_language_description')}
          after={
            <Switch
              variant="Primary"
              value={useLanguageSpecificPronouns}
              onChange={handleSetEnabled}
            />
          }
        />
        {useLanguageSpecificPronouns && (
          <SettingTile
            title={t('selected_language_for_pronouns_title')}
            focusId="selected-language-for-pronouns"
            description={t('selected_language_for_pronouns_description')}
            after={
              <Input
                value={languageList}
                size="300"
                radii="300"
                variant="Secondary"
                // input should be a comma separated list of language codes, e.g. "en", "de", "en,de"
                placeholder={t('selected_language_for_pronouns_example')}
                disabled={!useLanguageSpecificPronouns}
                onChange={handleLanguageListChange}
                style={{ width: '232px' }}
              />
            }
          />
        )}
      </SequenceCard>
    </Box>
  );
}
