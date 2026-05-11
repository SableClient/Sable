import { PageNavContent } from '$components/page';
import { Box } from 'folds';
import { SettingsSectionPage } from '../SettingsSectionPage';
import { PerMessageProfileOverview } from './PerMessageProfileOverview';
import { PKCompatSettings } from './PKCompat';

type PerMessageProfilePageProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

export function PerMessageProfilePage({ requestBack, requestClose }: PerMessageProfilePageProps) {
  return (
    <SettingsSectionPage title="Persona" requestBack={requestBack} requestClose={requestClose}>
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
          <PKCompatSettings />
          <PerMessageProfileOverview />
        </Box>
      </PageNavContent>
    </SettingsSectionPage>
  );
}
