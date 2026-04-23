import { Box, color, Spinner, Switch, Text } from 'folds';
import type { MatrixError, RoomJoinRulesEventContent } from '$types/matrix-sdk';
import { JoinRule, EventType } from '$types/matrix-sdk';
import { SequenceCard } from '$components/sequence-card';
import { SequenceCardStyle } from '$features/room-settings/styles.css';
import { SettingTile } from '$components/setting-tile';
import { useRoom } from '$hooks/useRoom';
import { useRoomDirectoryVisibility } from '$hooks/useRoomDirectoryVisibility';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { useStateEvent } from '$hooks/useStateEvent';
import type { ExtendedJoinRules } from '$components/JoinRulesSwitcher';
import type { RoomPermissionsAPI } from '$hooks/useRoomPermissions';

type RoomPublishProps = {
  permissions: RoomPermissionsAPI;
};
export function RoomPublish({ permissions }: RoomPublishProps) {
  const mx = useMatrixClient();
  const room = useRoom();

  const canEditCanonical = permissions.stateEvent(EventType.RoomCanonicalAlias, mx.getSafeUserId());
  const joinRuleEvent = useStateEvent(room, EventType.RoomJoinRules);
  const content = joinRuleEvent?.getContent<RoomJoinRulesEventContent>();
  const rule: ExtendedJoinRules = (content?.join_rule as ExtendedJoinRules) ?? JoinRule.Invite;

  const { visibilityState, setVisibility } = useRoomDirectoryVisibility(room.roomId);

  const [toggleState, toggleVisibility] = useAsyncCallback(setVisibility);

  const loading =
    visibilityState.status === AsyncStatus.Loading || toggleState.status === AsyncStatus.Loading;
  const validRule =
    rule === JoinRule.Public || rule === JoinRule.Knock || rule === 'knock_restricted';

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title="Publish to Directory"
        description={
          room.isSpaceRoom()
            ? 'List the space in the public directory to make it discoverable by others.'
            : 'List the room in the public directory to make it discoverable by others.'
        }
        after={
          <Box gap="200" alignItems="Center">
            {loading && <Spinner variant="Secondary" />}
            {!loading && visibilityState.status === AsyncStatus.Success && (
              <Switch
                value={visibilityState.data}
                onChange={toggleVisibility}
                disabled={!canEditCanonical || !validRule}
              />
            )}
          </Box>
        }
      >
        {visibilityState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(visibilityState.error as MatrixError).message}
          </Text>
        )}

        {toggleState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(toggleState.error as MatrixError).message}
          </Text>
        )}
      </SettingTile>
    </SequenceCard>
  );
}
