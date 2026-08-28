import { Box, Scroll, Text } from 'folds';
import { PageContent, SettingsSectionPage } from '$components/page';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useRoom } from '$hooks/useRoom';
import {
  RoomProfile,
  RoomEncryption,
  RoomHistoryVisibility,
  RoomJoinRules,
  RoomLocalAddresses,
  RoomPublishedAddresses,
  RoomPublish,
  RoomUpgrade,
} from '$features/common-settings/general';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';

type GeneralProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function General({ requestBack, requestClose }: GeneralProps) {
  const room = useRoom();
  const isSpace = room.isSpaceRoom();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);

  return (
    <SettingsSectionPage title="General" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <RoomProfile permissions={permissions} />
              <Box direction="Column" gap="100">
                <Text size="L400">Options</Text>
                <RoomJoinRules permissions={permissions} />
                {!isSpace && (
                  <>
                    <RoomHistoryVisibility permissions={permissions} />
                    <RoomEncryption permissions={permissions} />
                  </>
                )}
                <RoomPublish permissions={permissions} />
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Addresses</Text>
                <RoomPublishedAddresses permissions={permissions} />
                <RoomLocalAddresses permissions={permissions} />
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Advanced Options</Text>
                <RoomUpgrade permissions={permissions} requestClose={requestClose} />
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
