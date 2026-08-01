import { Box, Text, Scroll } from 'folds';
import { menuIcon, Warning } from '$components/icons/phosphor';
import { PageContent, SettingsSectionPage } from '$components/page';
import { InfoCard } from '$components/info-card';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { SettingToggle } from '$components/setting-tile';
import { BandwidthSavingEmojis } from './BandwithSavingEmojis';
import { MSC4268HistoryShare } from './MSC4268HistoryShare';
import { MSC4274MediaGalleries } from './MSC4274MediaGalleries';

function PersonaToggle() {
  const [showPersonaSetting, setShowPersonaSetting] = useSetting(
    settingsAtom,
    'showPersonaSetting'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Personas (Per-Message Profiles)</Text>
      <SettingToggle
        title="Show Personas Tab"
        focusId="show-personas-tab"
        description="Enables the personas tab in the settings menu for per-message profiles"
        value={showPersonaSetting}
        onChange={setShowPersonaSetting}
      />
    </Box>
  );
}

function NewCallsToggle() {
  const [newCallsEnabled, setNewCallsEnabled] = useSetting(settingsAtom, 'newCallsEnabled');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">New calls</Text>
      <SettingToggle
        title="Enable new calls"
        focusId="new-calls"
        description="Uses LiveKit JS on web and desktop, and native LiveKit on supported mobile devices. Element Call remains the fallback."
        value={newCallsEnabled}
        onChange={setNewCallsEnabled}
      />
    </Box>
  );
}

type ExperimentalProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function Experimental({ requestBack, requestClose }: Readonly<ExperimentalProps>) {
  return (
    <SettingsSectionPage title="Experimental" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <InfoCard
              before={menuIcon(Warning, { weight: 'fill' })}
              variant="Warning"
              description={
                <>
                  The features listed below may be unstable or incomplete,{' '}
                  <strong>use at your own risk</strong>.
                  <br />
                  Please report any new issues potentially caused by these features!
                </>
              }
            />
            <br />
            <Box direction="Column" gap="700">
              <MSC4268HistoryShare />
              <BandwidthSavingEmojis />
              <PersonaToggle />
              <NewCallsToggle />
              <MSC4274MediaGalleries />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
