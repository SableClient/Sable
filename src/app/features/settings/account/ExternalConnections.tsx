import { SequenceCard } from '$components/sequence-card';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { UserProfile } from '$hooks/useUserProfile';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { Box, Text } from 'folds';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { SequenceCardStyle } from '../styles.css';
import { ExternalListenbrainzConnectionEditor } from './ExternalListenbrainzConnection';

type ExternalConnectionsProps = {
  profile: UserProfile;
  userId: string;
};
export function ExternalConnectionsEditor({ profile, userId }: ExternalConnectionsProps) {
  const mx = useMatrixClient();
  const setGlobalProfiles = useSetAtom(profilesCacheAtom);

  const handleSaveField = useCallback(
    async (key: string, value: any) => {
      await mx.setExtendedProfileProperty?.(key, value);
      setGlobalProfiles((prev) => {
        const newCache = { ...prev };
        delete newCache[userId];
        return newCache;
      });
    },
    [mx, userId, setGlobalProfiles]
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">External Connections</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <ExternalListenbrainzConnectionEditor
          current={profile.listenBrainzAccount}
          onSave={(con) => handleSaveField('fyi.cisnt.external.listenbrainz', con)}
        />
      </SequenceCard>
    </Box>
  );
}
