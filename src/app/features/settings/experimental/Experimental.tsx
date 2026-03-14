import { Box, Text, IconButton, Icon, Icons, Scroll } from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { InfoCard } from '$components/info-card';
import { LanguageSpecificPronouns } from '../cosmetics/LanguageSpecificPronouns';
import { Sync } from '../general';
import { BandwidthSavingEmojis } from './BandwithSavingEmojis';

type ExperimentalProps = {
  requestClose: () => void;
};
export function Experimental({ requestClose }: ExperimentalProps) {
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
                  The features listed below may be unstable or incomplete,
                  <strong> use at your own risk</strong>.
                  <br />
                  Please report any new issues potentially caused by these features!
                </>
              }
            />
            <br />
            <Box direction="Column" gap="700">
              <Sync />
              <LanguageSpecificPronouns />
              <BandwidthSavingEmojis />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
