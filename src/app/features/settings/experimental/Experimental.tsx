import { Box, Text, Scroll, Switch } from 'folds';
import { menuIcon, Warning } from '$components/icons/phosphor';
import { PageContent } from '$components/page';
import { InfoCard } from '$components/info-card';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';
import { Sync } from '../general';
import { SettingsSectionPage } from '../SettingsSectionPage';
import { BandwidthSavingEmojis } from './BandwithSavingEmojis';
import { MSC4268HistoryShare } from './MSC4268HistoryShare';
import { EncryptedSearch } from './EncryptedSearch';
import { SearchIndexToggle } from './SearchIndexToggle';
import { EditInInput } from './EditInInput';
import { MessageGrouping } from './MessageGrouping';
import { MSC4438MessageBookmarks } from './MSC4438MessageBookmarks';

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
          focusId="show-personas-tab"
          description="Enables the personas tab in the settings menu for per-message profiles"
          after={
            <Switch variant="Primary" value={showPersonaSetting} onChange={setShowPersonaSetting} />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function TiptapComposerToggle() {
  const [useTiptapComposer, setUseTiptapComposer] = useSetting(settingsAtom, 'useTiptapComposer');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Tiptap Composer</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Use Tiptap Composer"
          focusId="use-tiptap-composer"
          description="Enables the experimental rich-text composer in rooms"
          after={
            <Switch variant="Primary" value={useTiptapComposer} onChange={setUseTiptapComposer} />
          }
        />
      </SequenceCard>
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
              <Sync />
              <BandwidthSavingEmojis />
              <MSC4268HistoryShare />
              <EncryptedSearch />
              <SearchIndexToggle />
              <EditInInput />
              <MessageGrouping />
              <MSC4438MessageBookmarks />
              <PersonaToggle />
              <TiptapComposerToggle />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
