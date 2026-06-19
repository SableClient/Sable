import { useMatrixClient } from '$hooks/useMatrixClient';
import type { PerMessageProfile } from '$hooks/usePerMessageProfile';
import {
  addOrUpdatePerMessageProfile,
  getAllPerMessageProfiles,
} from '$hooks/usePerMessageProfile';
import { useEffect, useState } from 'react';
import { Box, Button, Text, config } from 'folds';
import { generateShortId } from '$utils/shortIdGen';
import { PerMessageProfileEditor } from './PerMessageProfileEditor';

/**
 * Renders a list of per-message profiles along with an editor.
 * @returns rendering of per message profile list including editor
 */
export function PerMessageProfileOverview() {
  const mx = useMatrixClient();
  const [profiles, setProfiles] = useState<PerMessageProfile[]>([]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const fetchedProfiles = await getAllPerMessageProfiles(mx);
      setProfiles(fetchedProfiles);
    };
    fetchProfiles();
  }, [mx]);

  // Handler to remove a profile from the list after deletion
  const handleDelete = (profileId: string) => {
    setProfiles((prevProfiles) => prevProfiles.filter((profile) => profile.id !== profileId));
  };

  return (
    <Box gap="300" direction="Column" alignItems="Stretch">
      <Box direction="Row" gap="200" alignItems="Center" justifyContent="SpaceBetween" wrap="Wrap">
        <Text size="H4">Per-Message Profiles</Text>
        <Button
          onClick={() => {
            const newProfile: PerMessageProfile = {
              id: generateShortId(5),
              name: 'New Profile',
            };
            addOrUpdatePerMessageProfile(mx, newProfile).then(() => {
              setProfiles((prevProfiles) => [...prevProfiles, newProfile]);
            });
          }}
          variant="Primary"
          size="300"
          radii="300"
        >
          <Text size="H5">Add</Text>
        </Button>
      </Box>
      <Box direction="Column" gap="300" style={{ width: '100%', paddingBottom: config.space.S300 }}>
        {profiles.map((profile) => (
          <PerMessageProfileEditor
            mx={mx}
            key={`profile-list-item-${profile.id}`}
            profileId={profile.id}
            avatarMxcUrl={profile.avatarUrl}
            displayName={profile.name}
            pronouns={profile.pronouns}
            onDelete={handleDelete}
          />
        ))}
      </Box>
    </Box>
  );
}
