import { useCallback, useEffect } from 'react';
import { Box, Button, Switch, Text } from 'folds';

import { SettingMenuSelector } from '$components/setting-menu-selector';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { DarkTheme, LightTheme, Theme, ThemeKind, useThemeNames, useThemes } from '$hooks/useTheme';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { useStore } from 'jotai/react';

import { useThemeCatalogOnboardingGate } from './ThemeCatalogOnboarding';
import { ThemeCatalogSettings, usePatchSettings } from './ThemeCatalogSettings';

function makeThemeOptions(themes: Theme[], themeNames: Record<string, string>) {
  return themes.map((theme) => ({
    value: theme.id,
    label: themeNames[theme.id] ?? theme.id,
  }));
}

function SelectTheme({ disabled }: Readonly<{ disabled?: boolean }>) {
  const themes = useThemes();
  const themeNames = useThemeNames();
  const [themeId, setThemeId] = useSetting(settingsAtom, 'themeId');

  const themeOptions = makeThemeOptions(themes, themeNames);
  const selectedThemeId =
    themeOptions.find((theme) => theme.value === themeId)?.value ?? LightTheme.id;

  return (
    <SettingMenuSelector
      value={selectedThemeId}
      options={themeOptions}
      onSelect={setThemeId}
      disabled={disabled}
    />
  );
}

function SystemThemePreferences() {
  const themeNames = useThemeNames();
  const themes = useThemes();
  const [lightThemeId, setLightThemeId] = useSetting(settingsAtom, 'lightThemeId');
  const [darkThemeId, setDarkThemeId] = useSetting(settingsAtom, 'darkThemeId');

  const lightThemes = themes.filter((theme) => theme.kind === ThemeKind.Light);
  const darkThemes = themes.filter((theme) => theme.kind === ThemeKind.Dark);
  const lightThemeOptions = makeThemeOptions(lightThemes, themeNames);
  const darkThemeOptions = makeThemeOptions(darkThemes, themeNames);

  const selectedLightThemeId =
    lightThemeOptions.find((theme) => theme.value === lightThemeId)?.value ?? LightTheme.id;
  const selectedDarkThemeId =
    darkThemeOptions.find((theme) => theme.value === darkThemeId)?.value ?? DarkTheme.id;

  return (
    <Box wrap="Wrap" gap="400">
      <SettingTile
        title="Light Theme:"
        focusId="light-theme"
        after={
          <SettingMenuSelector
            value={selectedLightThemeId}
            options={lightThemeOptions}
            onSelect={setLightThemeId}
          />
        }
      />
      <SettingTile
        title="Dark Theme:"
        focusId="dark-theme"
        after={
          <SettingMenuSelector
            value={selectedDarkThemeId}
            options={darkThemeOptions}
            onSelect={setDarkThemeId}
          />
        }
      />
    </Box>
  );
}

function ClassicThemeSection({ onBrowseCatalog }: { onBrowseCatalog: () => void }) {
  const [systemTheme, setSystemTheme] = useSetting(settingsAtom, 'useSystemTheme');

  return (
    <Box direction="Column" gap="100">
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="System Theme"
          focusId="system-theme"
          description="Sync with your device's light/dark mode."
          after={<Switch variant="Primary" value={systemTheme} onChange={setSystemTheme} />}
        />
        {systemTheme && <SystemThemePreferences />}
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Manual Theme"
          focusId="manual-theme"
          description="Active when System Theme is disabled."
          after={<SelectTheme disabled={systemTheme} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Remote theme catalog"
          focusId="browse-remote-catalog"
          description="Browse themes from the official catalog, save favorites, and sync with light and dark mode."
          after={
            <Button variant="Secondary" size="300" radii="300" onClick={onBrowseCatalog}>
              <Text size="B300">Browse catalog…</Text>
            </Button>
          }
        />
      </SequenceCard>
    </Box>
  );
}

function RemoteCatalogThemeSection({
  onBrowseOpenChange,
}: {
  onBrowseOpenChange?: (open: boolean) => void;
}) {
  return <ThemeCatalogSettings mode="appearance" onBrowseOpenChange={onBrowseOpenChange} />;
}

export function ThemeAppearanceSection({
  onBrowseOpenChange,
}: {
  onBrowseOpenChange?: (open: boolean) => void;
} = {}) {
  const store = useStore();
  const [onboardingDone] = useSetting(settingsAtom, 'themeCatalogOnboardingDone');
  const [catalogEnabled] = useSetting(settingsAtom, 'themeRemoteCatalogEnabled');

  useEffect(() => {
    if (!catalogEnabled) onBrowseOpenChange?.(false);
  }, [catalogEnabled, onBrowseOpenChange]);

  const completeOnboarding = useCallback(
    (enabled: boolean) => {
      const next = { ...store.get(settingsAtom), themeCatalogOnboardingDone: true };
      next.themeRemoteCatalogEnabled = enabled;
      store.set(settingsAtom, next);
    },
    [store]
  );

  const { dialog } = useThemeCatalogOnboardingGate(onboardingDone, completeOnboarding);

  const patchSettings = usePatchSettings();
  const enableCatalog = useCallback(() => {
    patchSettings({ themeRemoteCatalogEnabled: true, themeCatalogOnboardingDone: true });
  }, [patchSettings]);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Theme</Text>
      {dialog}
      {catalogEnabled ? (
        <RemoteCatalogThemeSection onBrowseOpenChange={onBrowseOpenChange} />
      ) : (
        <ClassicThemeSection onBrowseCatalog={enableCatalog} />
      )}
    </Box>
  );
}
