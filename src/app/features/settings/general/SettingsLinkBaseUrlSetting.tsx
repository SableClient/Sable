import { ChangeEventHandler, FormEventHandler, useEffect, useMemo, useState } from 'react';
import { Box, Button, config, Icon, IconButton, Icons, Input, Text } from 'folds';
import { useClientConfig } from '$hooks/useClientConfig';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getConfiguredSettingsLinkBaseUrl, normalizeSettingsLinkBaseUrl } from '../settingsLink';

export function SettingsLinkBaseUrlSetting() {
  const clientConfig = useClientConfig();
  const [settingsLinkBaseUrlOverride, setSettingsLinkBaseUrlOverride] = useSetting(
    settingsAtom,
    'settingsLinkBaseUrlOverride'
  );
  const configuredBaseUrl = useMemo(
    () => getConfiguredSettingsLinkBaseUrl(clientConfig),
    [clientConfig]
  );
  const currentValue =
    normalizeSettingsLinkBaseUrl(settingsLinkBaseUrlOverride) ?? configuredBaseUrl;
  const [inputValue, setInputValue] = useState(currentValue);

  useEffect(() => {
    setInputValue(currentValue);
  }, [currentValue]);

  const trimmedValue = inputValue.trim();
  const normalizedInputValue = normalizeSettingsLinkBaseUrl(trimmedValue);
  const nextOverrideValue =
    normalizedInputValue && normalizedInputValue !== configuredBaseUrl
      ? normalizedInputValue
      : undefined;
  const hasChanges = normalizedInputValue !== currentValue;
  const isValid = Boolean(normalizedInputValue);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setInputValue(evt.currentTarget.value);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!isValid) return;

    setSettingsLinkBaseUrlOverride(nextOverrideValue);
    setInputValue(normalizedInputValue ?? configuredBaseUrl);
  };

  const handleReset = () => {
    setInputValue(configuredBaseUrl);
  };

  return (
    <SettingTile
      title="Settings Link Base Url"
      focusId="settings-link-base-url"
      description={`Copied settings links use this URL. Default: ${configuredBaseUrl}`}
    >
      <Box direction="Column" grow="Yes" gap="100">
        <Box as="form" onSubmit={handleSubmit} gap="200">
          <Box grow="Yes" direction="Column">
            <Input
              aria-label="Settings link base URL"
              autoComplete="url"
              name="settingsLinkBaseUrlInput"
              radii="300"
              type="url"
              value={inputValue}
              variant="Secondary"
              style={{ paddingRight: config.space.S200 }}
              onChange={handleChange}
              after={
                hasChanges && (
                  <IconButton
                    type="reset"
                    onClick={handleReset}
                    size="300"
                    radii="300"
                    variant="Secondary"
                    aria-label="Reset settings link base URL"
                    title="Reset settings link base URL"
                  >
                    <Icon src={Icons.Cross} size="100" />
                  </IconButton>
                )
              }
            />
          </Box>
          <Button
            disabled={!hasChanges || !isValid}
            fill={hasChanges && isValid ? 'Solid' : 'Soft'}
            outlined
            radii="300"
            size="400"
            type="submit"
            variant={hasChanges && isValid ? 'Success' : 'Secondary'}
          >
            <Text size="B400">Save</Text>
          </Button>
        </Box>
      </Box>
      {!isValid && (
        <Text size="T200" priority="400">
          Enter a full `http://` or `https://` URL.
        </Text>
      )}
    </SettingTile>
  );
}
