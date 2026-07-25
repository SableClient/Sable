import { PageContent, SettingsSectionPage } from '$components/page';
import { Box, Scroll } from 'folds';
import { PerMessageProfileOverview } from './PerMessageProfileOverview';
import { PKCompatSettings } from './PKCompat';
import { PickerPageSettings } from './PickerPage';
import type { PerMessageProfile } from '$hooks/usePerMessageProfile';
import { useState } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { PerMessageProfileEditorView } from './PerMessageProfileEditorView';

type PerMessageProfilePageProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

export function PerMessageProfilePage({ requestBack, requestClose }: PerMessageProfilePageProps) {
  const mx = useMatrixClient();
  const [editingProfile, setEditingProfile] = useState<PerMessageProfile>();

  const handleEditorClose = () => {
    setEditingProfile(undefined);
  };

  if (editingProfile) {
    return (
      <PerMessageProfileEditorView
        mx={mx}
        profileId={editingProfile.id}
        avatarMxcUrl={editingProfile.avatarUrl}
        displayName={editingProfile.name}
        pronouns={editingProfile.pronouns}
        requestClose={handleEditorClose}
      />
    );
  }
  return (
    <SettingsSectionPage title="Persona" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box gap="700" direction="Column">
              <PickerPageSettings />
              <PKCompatSettings />
              <PerMessageProfileOverview
                onCreateProfile={setEditingProfile}
                onEditProfile={setEditingProfile}
              />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
