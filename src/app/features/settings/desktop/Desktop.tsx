import { isTauri } from '@tauri-apps/api/core';
import { useAtom } from 'jotai';
import { Box, Text, Scroll, Switch, color } from 'folds';
import { autoUpdateCheckAtom } from '$state/autoUpdateCheck';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
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
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Use custom title bar"
                    focusId="use-custom-title-bar"
                    description="Use Sable-drawn window controls and connection status instead of the native window chrome."
                    after={
                      <Switch
                        aria-label="use-custom-title-bar"
                        value={useCustomTitleBar}
                        onChange={setUseCustomTitleBar}
                      />
                    }
                  />
                </SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Close button keeps Sable running"
                    focusId="close-to-background-on-close"
                    description="When enabled, closing the window keeps Sable running instead of exiting. If the tray icon is enabled and available, Sable stays in the system tray. Otherwise it continues running in the background."
                    after={
                      <Switch
                        aria-label="close-to-background-on-close"
                        value={closeToBackgroundOnClose}
                        onChange={setCloseToBackgroundOnClose}
                      />
                    }
                  />
                </SequenceCard>
                {type !== 'macos' && (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title="Show system tray icon"
                      focusId="show-system-tray-icon"
                      description={
                        trayFallback ? (
                          <Text as="span" style={{ color: color.Warning.Main }} size="T200">
                            System tray is unavailable on this system. Sable can still keep running
                            in the background without it.
                          </Text>
                        ) : (
                          'Show a system tray icon while Sable is running. Disable this if you want Sable to stay available without a tray icon.'
                        )
                      }
                      after={
                        <Switch
                          aria-label="show-system-tray-icon"
                          value={!trayFallback ? showSystemTrayIcon : false}
                          disabled={trayFallback}
                          onChange={setShowSystemTrayIcon}
                        />
                      }
                    />
                  </SequenceCard>
                )}
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Updates</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Automatically check for updates"
                    focusId="auto-update-check"
                    description="Check GitHub for a new release on launch. Turn off to avoid contacting GitHub."
                    after={
                      <Switch
                        aria-label="auto-update-check"
                        value={autoUpdateCheck}
                        onChange={setAutoUpdateCheck}
                      />
                    }
                  />
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
