import { Box, Text, IconButton, Icon, Icons, Scroll, Switch } from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { InfoCard } from '$components/info-card';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';
import { LanguageSpecificPronouns } from '../cosmetics/LanguageSpecificPronouns';
import { Sync } from '../general';
import { BandwidthSavingEmojis } from './BandwithSavingEmojis';
import { MSC4268HistoryShare } from './MSC4268HistoryShare';

function PersonaToggle() {
  const [showPersonaSetting, setShowPersonaSetting] = useSetting(
    settingsAtom,
    'showPersonaSetting'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Personas (Per-Message Profiles)</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Show Personas Tab"
          description="Enables the personas tab in the settings menu for per-message profiles"
          after={
            <Switch variant="Primary" value={showPersonaSetting} onChange={setShowPersonaSetting} />
          }
        />
      </SequenceCard>
    </Box>
  );
}

type ExperimentalProps = {
  requestClose: () => void;
};
export function Experimental({ requestClose }: Readonly<ExperimentalProps>) {
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Experimental
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
            <InfoCard
              before=<Icon src={Icons.Warning} size="100" filled />
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
              <Sync />
              <MSC4268HistoryShare />
              <LanguageSpecificPronouns />
              <BandwidthSavingEmojis />
              <PersonaToggle />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
