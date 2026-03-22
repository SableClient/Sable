import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  addOrUpdatePerMessageProfile,
  getAllPerMessageProfiles,
  PerMessageProfile,
} from '$hooks/usePerMessageProfile';
import { useEffect, useState } from 'react';
import { Box, Button, Text } from 'folds';
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
    <Box gap="100" direction="Column" alignItems="Start">
      <Box direction="Row" gap="100" alignItems="Center">
        <Text size="H4">Per-Message Profiles</Text>
        <Button
          onClick={() => {
            const newProfile: PerMessageProfile = {
              id: crypto.randomUUID(),
              name: 'New Profile',
            };
            addOrUpdatePerMessageProfile(mx, newProfile).then(() => {
              setProfiles((prevProfiles) => [...prevProfiles, newProfile]);
            });
          }}
          variant="Primary"
        >
          <Text size="H5">Add</Text>
        </Button>
      </Box>
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
  );
}
