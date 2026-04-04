import { useCallback, useMemo, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import { useStore } from 'jotai/react';

import { useOptionalClientConfig } from '$hooks/useClientConfig';
import { useSetting } from '$state/hooks/settings';
import { trimTrailingSlash } from '$utils/common';
import { defaultSettings, settingsAtom } from '$state/settings';
import { stopPropagation } from '$utils/keyboard';

import { usePatchSettings } from '$features/settings/cosmetics/themeSettingsPatch';
import { DEFAULT_THEME_CATALOG_BASE } from '../../theme/catalogDefaults';
import { needsLegacyThemeMigration } from '../../theme/legacyToCatalogMap';
import { runLegacyThemeMigration } from '../../theme/migrateLegacyThemes';

export function ThemeMigrationBanner() {
  const store = useStore();
  const [themeMigrationDismissed] = useSetting(settingsAtom, 'themeMigrationDismissed');
  const [themeId] = useSetting(settingsAtom, 'themeId');
  const [lightThemeId] = useSetting(settingsAtom, 'lightThemeId');
  const [darkThemeId] = useSetting(settingsAtom, 'darkThemeId');
  const patchSettings = usePatchSettings();
  const clientConfig = useOptionalClientConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      needsLegacyThemeMigration({
        ...defaultSettings,
        themeMigrationDismissed: themeMigrationDismissed ?? false,
        themeId,
        lightThemeId,
        darkThemeId,
      }),
    [themeMigrationDismissed, themeId, lightThemeId, darkThemeId]
  );

  const catalogBase = trimTrailingSlash(
    clientConfig?.themeCatalogBaseUrl?.trim() || DEFAULT_THEME_CATALOG_BASE
  );

  const dismiss = useCallback(() => {
    patchSettings({ themeMigrationDismissed: true });
  }, [patchSettings]);

  const dismissSafe = useCallback(() => {
    if (busy) return;
    dismiss();
  }, [busy, dismiss]);

  const migrate = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const current = store.get(settingsAtom);
      const result = await runLegacyThemeMigration(current, catalogBase);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      patchSettings(result.partial);
    } finally {
      setBusy(false);
    }
  }, [catalogBase, patchSettings, store]);

  if (!visible) return null;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: dismissSafe,
            clickOutsideDeactivates: false,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" aria-labelledby="theme-migration-title">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text id="theme-migration-title" size="H4">
                  Update your theme selection
                </Text>
              </Box>
              <IconButton
                size="300"
                variant="Secondary"
                fill="Soft"
                outlined
                radii="300"
                onClick={dismissSafe}
                disabled={busy}
                aria-label="Close"
              >
                <Icon src={Icons.Cross} size="100" />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Text priority="400">
                Older bundled color themes are no longer included in the app. Migrate to the same
                looks from the official catalog (downloaded and cached on this device), or dismiss
                this reminder.
              </Text>
              {error && (
                <Text size="T300" priority="400" style={{ color: 'var(--sable-error)' }}>
                  {error}
                </Text>
              )}
              <Box direction="Column" gap="200">
                <Button
                  variant="Primary"
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={migrate}
                  disabled={busy}
                >
                  <Text size="B400">{busy ? 'Migrating…' : 'Migrate'}</Text>
                </Button>
                <Button
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={dismissSafe}
                  disabled={busy}
                >
                  <Text size="B400">Not now</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
