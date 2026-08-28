import { isTauri } from '@tauri-apps/api/core';
import { useAtom } from 'jotai';
import { Box, Text, Scroll, color } from 'folds';
import { autoUpdateCheckAtom } from '$state/autoUpdateCheck';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SettingToggle } from '$components/setting-tile';
import {
  useDesktopRuntimeState,
  useDesktopSetting,
  useDesktopSettingsReady,
  useDesktopSettingsSyncing,
} from '$state/hooks/desktopSettings';
import { type as osType } from '@tauri-apps/plugin-os';

type DesktopProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

export function Desktop({ requestBack, requestClose }: DesktopProps) {
  const ready = useDesktopSettingsReady();
  const syncing = useDesktopSettingsSyncing();
  const runtimeState = useDesktopRuntimeState();
  const [closeToBackgroundOnClose, setCloseToBackgroundOnClose] = useDesktopSetting(
    'closeToBackgroundOnClose'
  );
  const [showSystemTrayIcon, setShowSystemTrayIcon] = useDesktopSetting('showSystemTrayIcon');
  const [useCustomTitleBar, setUseCustomTitleBar] = useDesktopSetting('useCustomTitleBar');
  const [spellcheck, setSpellcheck] = useDesktopSetting('spellcheck');
  const [autoUpdateCheck, setAutoUpdateCheck] = useAtom(autoUpdateCheckAtom);

  if (!isTauri() || !ready) return null;

  let type = osType();
  if (type === 'android' || type === 'ios') return null;

  const trayFallback = showSystemTrayIcon && !runtimeState.trayAvailable && !syncing;

  return (
    <SettingsSectionPage title="Desktop" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Window</Text>
                <SettingToggle
                  title="Use custom title bar"
                  focusId="use-custom-title-bar"
                  description="Use Sable-drawn window controls and connection status instead of the native window chrome."
                  value={useCustomTitleBar}
                  onChange={setUseCustomTitleBar}
                  ariaLabel="use-custom-title-bar"
                />
                <SettingToggle
                  title="Close button keeps Sable running"
                  focusId="close-to-background-on-close"
                  description={
                    type === 'macos'
                      ? 'When enabled, closing the window keeps Sable running instead of exiting. Reopen it from the Dock.'
                      : 'When enabled, closing the window keeps Sable running in the system tray instead of exiting. This needs the tray icon below: without a tray to restore from, closing exits Sable.'
                  }
                  value={closeToBackgroundOnClose}
                  onChange={setCloseToBackgroundOnClose}
                  ariaLabel="close-to-background-on-close"
                />
                {type !== 'macos' && (
                  <SettingToggle
                    title="Show system tray icon"
                    focusId="show-system-tray-icon"
                    description={
                      trayFallback ? (
                        <Text as="span" style={{ color: color.Warning.Main }} size="T200">
                          System tray is unavailable on this system. Without it, closing the window
                          exits Sable.
                        </Text>
                      ) : (
                        'Show a system tray icon while Sable is running. Disable this if you want Sable to stay available without a tray icon.'
                      )
                    }
                    value={!trayFallback ? showSystemTrayIcon : false}
                    disabled={trayFallback}
                    onChange={setShowSystemTrayIcon}
                    ariaLabel="show-system-tray-icon"
                  />
                )}
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Text input</Text>
                <SettingToggle
                  title="Spellcheck"
                  focusId="spellcheck"
                  description="Underline misspelled words and offer corrections in text fields."
                  value={spellcheck}
                  onChange={setSpellcheck}
                  ariaLabel="spellcheck"
                />
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Updates</Text>
                <SettingToggle
                  title="Automatically check for updates"
                  focusId="auto-update-check"
                  description="Check GitHub for a new release on launch. Turn off to avoid contacting GitHub."
                  value={autoUpdateCheck}
                  onChange={setAutoUpdateCheck}
                  ariaLabel="auto-update-check"
                />
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
