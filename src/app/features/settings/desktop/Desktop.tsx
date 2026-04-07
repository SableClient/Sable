import { isTauri } from '@tauri-apps/api/core';
import { Box, Text, IconButton, Icon, Icons, Scroll, Switch, color } from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import {
  useDesktopRuntimeState,
  useDesktopSetting,
  useDesktopSettingsReady,
  useDesktopSettingsSyncing,
} from '$state/hooks/desktopSettings';
import { SequenceCardStyle } from '$features/settings/styles.css';

type DesktopProps = {
  requestClose: () => void;
};

export function Desktop({ requestClose }: DesktopProps) {
  const ready = useDesktopSettingsReady();
  const syncing = useDesktopSettingsSyncing();
  const runtimeState = useDesktopRuntimeState();
  const [closeToBackgroundOnClose, setCloseToBackgroundOnClose] = useDesktopSetting(
    'closeToBackgroundOnClose'
  );
  const [showSystemTrayIcon, setShowSystemTrayIcon] = useDesktopSetting('showSystemTrayIcon');

  if (!isTauri() || !ready) return null;

  const trayFallback = showSystemTrayIcon && !runtimeState.trayAvailable && !syncing;

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Desktop
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
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
                    title="Close button keeps Sable running"
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
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Show system tray icon"
                    description={
                      trayFallback ? (
                        <Text as="span" style={{ color: color.Warning.Main }} size="T200">
                          System tray is unavailable on this system. Sable can still keep running in
                          the background without it.
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
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
