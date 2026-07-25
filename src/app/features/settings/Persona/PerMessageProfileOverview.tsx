import { useMatrixClient } from '$hooks/useMatrixClient';
import type { PerMessageProfile } from '$hooks/usePerMessageProfile';
import {
  addOrUpdatePerMessageProfile,
  getAllPerMessageProfiles,
  getPerMessageProfileById,
} from '$hooks/usePerMessageProfile';
import { useEffect, useState } from 'react';
import { Box, Button, Text } from 'folds';
import { generateShortId } from '$utils/shortIdGen';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { PerMessageProfileListItem } from './PerMessageProfileListItem';
import { SettingTile } from '$components/setting-tile';

type PerMessageProfileOverviewProps = {
  onCreateProfile: (profile: PerMessageProfile) => void;
  onEditProfile: (profile: PerMessageProfile) => void;
};
/**
 * Renders a list of per-message profiles along with an editor.
 * @returns rendering of per message profile list including editor
 */
export function PerMessageProfileOverview({
  onCreateProfile,
  onEditProfile,
}: PerMessageProfileOverviewProps) {
  const mx = useMatrixClient();
  const [profiles, setProfiles] = useState<PerMessageProfile[]>([]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const fetchedProfiles = await getAllPerMessageProfiles(mx);
      setProfiles(fetchedProfiles);
    };
    fetchProfiles();
  }, [mx]);

  const handleEdit = async (profileId: string) => {
    const profile = await getPerMessageProfileById(mx, profileId);
    if (profile) onEditProfile(profile);
  };

  return (
    <Box gap="100" direction="Column">
      <Text size="L400">Personas</Text>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <SettingTile
          focusId="create-pmp"
          title="Create Persona"
          description="Create Personas to attach custom profiles to messages."
          after={
            <Button
              size="300"
              radii="300"
              onClick={() => {
                const newProfile: PerMessageProfile = {
                  id: generateShortId(5),
                  name: 'New Profile',
                };
                addOrUpdatePerMessageProfile(mx, newProfile).then(() => {
                  onCreateProfile(newProfile);
                });
              }}
            >
              <Text size="B300">Add</Text>
            </Button>
          }
        />
      </SequenceCard>

      {profiles.map((profile) => (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          key={`profile-list-item-${profile.id}`}
        >
          <PerMessageProfileListItem
            mx={mx}
            profileId={profile.id}
            avatarMxcUrl={profile.avatarUrl}
            displayName={profile.name}
            pronouns={profile.pronouns}
            onOpenEditor={handleEdit}
          />
        </SequenceCard>
      ))}
    </Box>
  );
}
