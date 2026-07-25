import { useCallback, useMemo } from 'react';
import { Button, Spinner, Text } from 'folds';
import { CaretDown, menuIcon } from '$components/icons/phosphor';
import type { RoomHistoryVisibilityEventContent, StateEvents } from '$types/matrix-sdk';
import { HistoryVisibility, EventType } from '$types/matrix-sdk';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoom } from '$hooks/useRoom';

import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useStateEvent } from '$hooks/useStateEvent';
import { AsyncError } from '$components/AsyncError';
import type { RoomPermissionsAPI } from '$hooks/useRoomPermissions';
import {
  SettingMenuSelector,
  type SettingMenuOption,
} from '$components/setting-menu-selector/SettingMenuSelector';

const useVisibilityStr = () =>
  useMemo(
    () => ({
      [HistoryVisibility.Invited]: 'After Invite',
      [HistoryVisibility.Joined]: 'After Join',
      [HistoryVisibility.Shared]: 'All Messages',
      [HistoryVisibility.WorldReadable]: 'All Messages (Guests)',
    }),
    []
  );

const useVisibilityMenu = () =>
  useMemo(
    () => [
      HistoryVisibility.Shared,
      HistoryVisibility.Invited,
      HistoryVisibility.Joined,
      HistoryVisibility.WorldReadable,
    ],
    []
  );

type RoomHistoryVisibilityProps = {
  permissions: RoomPermissionsAPI;
};
export function RoomHistoryVisibility({ permissions }: RoomHistoryVisibilityProps) {
  const mx = useMatrixClient();
  const room = useRoom();

  const canEdit = permissions.stateEvent(EventType.RoomHistoryVisibility, mx.getSafeUserId());

  const visibilityEvent = useStateEvent(room, EventType.RoomHistoryVisibility);
  const historyVisibility: HistoryVisibility =
    visibilityEvent?.getContent<RoomHistoryVisibilityEventContent>().history_visibility ??
    HistoryVisibility.Shared;
  const visibilityMenu = useVisibilityMenu();
  const visibilityStr = useVisibilityStr();

  const [submitState, submit] = useAsyncCallback(
    useCallback(
      async (visibility: HistoryVisibility) => {
        const content: RoomHistoryVisibilityEventContent = {
          history_visibility: visibility,
        };
        await mx.sendStateEvent(
          room.roomId,
          EventType.RoomHistoryVisibility as keyof StateEvents,
          content
        );
      },
      [mx, room.roomId]
    )
  );
  const submitting = submitState.status === AsyncStatus.Loading;

  const options: SettingMenuOption<HistoryVisibility>[] = visibilityMenu.map((visibility) => ({
    value: visibility,
    label: visibilityStr[visibility],
  }));

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title="Message History Visibility"
        description="Changes to history visibility will only apply to future messages. The visibility of existing history will have no effect."
        after={
          <SettingMenuSelector
            value={historyVisibility}
            options={options}
            onSelect={submit}
            disabled={!canEdit}
            loading={submitting}
            renderTrigger={({ openMenu, disabled, loading }) => (
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                outlined
                disabled={disabled}
                onClick={openMenu}
                after={loading ? <Spinner size="100" variant="Secondary" /> : menuIcon(CaretDown)}
              >
                <Text size="B300">{visibilityStr[historyVisibility]}</Text>
              </Button>
            )}
          />
        }
      >
        <AsyncError state={submitState} />
      </SettingTile>
    </SequenceCard>
  );
}
