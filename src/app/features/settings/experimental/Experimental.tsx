import { Box, Text, Icon, Icons, Scroll, Switch } from 'folds';
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
import { t } from 'i18next';

function PersonaToggle() {
  const [showPersonaSetting, setShowPersonaSetting] = useSetting(
    settingsAtom,
    'showPersonaSetting'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{t('Settings.personas_per_message_profiles')}</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title={t('Settings.show_personas_tab')}
          focusId="show-personas-tab"
          description={t('Settings.enables_the_personas_tab_in_the_settings_menu_for_per_message_profiles')}
          after={
            <Switch variant="Primary" value={showPersonaSetting} onChange={setShowPersonaSetting} />
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
    <SettingsSectionPage title={t('Settings.experimental')} requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <InfoCard
              before=<Icon src={Icons.Warning} size="100" filled />
              variant="Warning"
              description={
                <>
                  {t('Settings.the_features_listed_below_may_be_unstable_or_incomplete')}{' '}
                  <strong>{t('Settings.use_at_your_own_risk')}</strong>.
                  <br />
                  {t('Settings.please_report_any_new_issues_potentially_caused_by_these_features')}
                </>
              }
            />
            <br />
            <Box direction="Column" gap="700">
              <Sync />
              <MSC4268HistoryShare />
              <BandwidthSavingEmojis />
              <PersonaToggle />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
