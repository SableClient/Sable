import { useState } from 'react';
import { Box, Scroll } from 'folds';
import { PageContent, SettingsSectionPage } from '$components/page';
import { useRoom } from '$hooks/useRoom';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';

import { PermissionGroups, Powers, PowersEditor } from '$features/common-settings/permissions';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { ROOM_PERMISSION_GROUPS, SPACE_PERMISSION_GROUPS } from './permissionGroups';
import { EventType } from '$types/matrix-sdk';
import { CustomStateEvent } from '$types/matrix/room';

type PermissionsProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function Permissions({ requestBack, requestClose }: PermissionsProps) {
  const mx = useMatrixClient();
  const room = useRoom();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);

  const canEditPowers = permissions.stateEvent(CustomStateEvent.PowerLevelTags, mx.getSafeUserId());
  const canEditPermissions = permissions.stateEvent(EventType.RoomPowerLevels, mx.getSafeUserId());
  const permissionGroups = room.isSpaceRoom() ? SPACE_PERMISSION_GROUPS : ROOM_PERMISSION_GROUPS;

  const [powerEditor, setPowerEditor] = useState(false);

  const handleEditPowers = () => {
    setPowerEditor(true);
  };

  if (canEditPowers && powerEditor) {
    return <PowersEditor powerLevels={powerLevels} requestClose={() => setPowerEditor(false)} />;
  }

  return (
    <SettingsSectionPage title="Permissions" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Powers
                powerLevels={powerLevels}
                onEdit={canEditPowers ? handleEditPowers : undefined}
                permissionGroups={permissionGroups}
              />
              <PermissionGroups
                canEdit={canEditPermissions}
                powerLevels={powerLevels}
                permissionGroups={permissionGroups}
              />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
