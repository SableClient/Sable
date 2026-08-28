import { PageContent, SettingsSectionPage } from '$components/page';
import { Box, Scroll } from 'folds';
import { PerMessageProfileOverview } from './PerMessageProfileOverview';
import { PKCompatSettings } from './PKCompat';
import { PickerPageSettings } from './PickerPage';
import type { PerMessageProfileMsc4461 } from '$hooks/usePerMessageProfile';
import { useState } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { PerMessageProfileEditorView } from './PerMessageProfileEditorView';

type PerMessageProfilePageProps = {
  requestBack?: () => void;
  requestClose: () => void;
};

export function PerMessageProfilePage({ requestBack, requestClose }: PerMessageProfilePageProps) {
  const mx = useMatrixClient();
  const [editingProfile, setEditingProfile] = useState<PerMessageProfileMsc4461>();

  const handleEditorClose = () => {
    setEditingProfile(undefined);
  };

  if (editingProfile) {
    return (
      <PerMessageProfileEditorView
        mx={mx}
        profileId={editingProfile.id}
        avatarMxcUrl={editingProfile.avatar_url}
        displayName={editingProfile.displayname}
        pronouns={editingProfile['io.fsky.nyx.pronouns']}
        nameColorLightTheme={editingProfile['eu.she-a.color']?.on_light}
        nameColorDarkTheme={editingProfile['eu.she-a.color']?.on_dark}
        shorthands={editingProfile.triggers ?? []}
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
