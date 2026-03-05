import { isTauri } from '@tauri-apps/api/core';
import { Box, Text, IconButton, Icon, Icons, Scroll, Switch } from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SequenceCardStyle } from '$features/settings/styles.css';

type DesktopProps = {
  requestClose: () => void;
};

export function Desktop({ requestClose }: DesktopProps) {
  const [closeToTray, setCloseToTray] = useSetting(settingsAtom, 'closeToTray');

  if (!isTauri()) return null;

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
                >
                  <SettingTile
                    title="Close to Tray"
                    description="Keep the app running in the system tray when the main window closes. Disable this to fully exit on close."
                    after={
                      <Switch variant="Primary" value={closeToTray} onChange={setCloseToTray} />
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
