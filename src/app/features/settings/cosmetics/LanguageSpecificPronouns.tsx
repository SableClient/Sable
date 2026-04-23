import { Box, Input, Switch, Text } from 'folds';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';
import { useEffect, useState } from 'react';
import { getSettings, setSettings } from '$state/settings';
import { SequenceCardStyle } from '../styles.css';

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
      <Text size="L400">Language Specific Pronouns</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          title="Show pronouns only in selected language"
          focusId="show-pronouns-only-in-selected-language"
          description="If enabled, pronouns are only shown when they match your selected language. This helps if your contacts set pronouns in different languages. It doesn't affect how your pronouns are shared with others."
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
            title="Selected language for pronouns"
            focusId="selected-language-for-pronouns"
            description="The language to show pronouns for when the above setting is enabled."
            after={
              <Input
                value={languageList}
                size="300"
                radii="300"
                variant="Secondary"
                // input should be a comma separated list of language codes, e.g. "en", "de", "en,de"
                placeholder="Language code (e.g. 'en', 'de', 'en,de')"
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
