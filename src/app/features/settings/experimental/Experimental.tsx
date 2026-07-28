import { Box, Text, Scroll } from 'folds';
import { menuIcon, Warning } from '$components/icons/phosphor';
import { PageContent, SettingsSectionPage } from '$components/page';
import { InfoCard } from '$components/info-card';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { SettingToggle } from '$components/setting-tile';
import { isNativeCallProbePlatformSupported } from '$features/call/nativeCallProbe';
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

function NativeCallsToggle() {
  const [nativeCallsEnabled, setNativeCallsEnabled] = useSetting(
    settingsAtom,
    'nativeCallsEnabled'
  );

  if (!isNativeCallProbePlatformSupported()) return null;

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Native Calls</Text>
      <SettingToggle
        title="Try Native Calls"
        focusId="native-calls"
        description="Tries the experimental native call transport instead of Element Call. Disable this to use the default Element Call experience."
        value={nativeCallsEnabled}
        onChange={setNativeCallsEnabled}
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
              <NativeCallsToggle />
              <MSC4274MediaGalleries />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
