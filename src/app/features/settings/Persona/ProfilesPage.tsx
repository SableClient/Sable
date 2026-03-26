import { PageNavContent } from '$components/page';
import { Box } from 'folds';
import { SettingsSectionPage } from '../SettingsSectionPage';
import { PerMessageProfileOverview } from './PerMessageProfileOverview';

type PerMessageProfilePageProps = {
  requestClose: () => void;
};

export function PerMessageProfilePage({ requestClose }: PerMessageProfilePageProps) {
  return (
    <SettingsSectionPage title="Persona" requestClose={requestClose}>
      <PageNavContent>
        <Box
          grow="Yes"
          gap="200"
          style={{
            paddingLeft: '20px',
            paddingRight: '20px',
            paddingTop: '10px',
            marginRight: '5px',
            marginLeft: '5px',
          }}
          direction="Column"
          shrink="No"
        >
          <PerMessageProfileOverview />
        </Box>
      </PageNavContent>
    </SettingsSectionPage>
  );
}
