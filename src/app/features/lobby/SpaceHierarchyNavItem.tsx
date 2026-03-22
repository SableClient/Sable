import { forwardRef } from 'react';
import { Room, IHierarchyRoom } from '$types/matrix-sdk';
import { Box } from 'folds';
import { HierarchyItem, HierarchyItemSpace } from '$hooks/useSpaceHierarchy';
import { IPowerLevels } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { StateEvent } from '$types/matrix/room';
import { getRoomCreatorsForRoomId } from '$hooks/useRoomCreators';
import { getRoomPermissionsAPI } from '$hooks/useRoomPermissions';
import { AfterItemDropTarget, CanDropCallback } from './DnD';
import { HierarchyItemMenu } from './HierarchyItemMenu';
import { SpaceNavItemCard } from './SpaceNavItem';

type SpaceHierarchyNavItemProps = {
  summary: IHierarchyRoom | undefined;
  spaceItem: HierarchyItemSpace;
  allJoinedRooms: Set<string>;
  roomsPowerLevels: Map<string, IPowerLevels>;
  categoryId: string;
  draggingItem?: HierarchyItem;
  onDragging: (item?: HierarchyItem) => void;
  canDrop: CanDropCallback;
  disabledReorder?: boolean;
  nextSpaceId?: string;
  pinned: boolean;
  togglePinToSidebar: (roomId: string) => void;
  getRoom: (roomId: string) => Room | undefined;
};
export const SpaceHierarchyNavItem = forwardRef<HTMLDivElement, SpaceHierarchyNavItemProps>(
  (
    {
      summary,
      spaceItem,
      allJoinedRooms,
      roomsPowerLevels,
      categoryId,
      draggingItem,
      onDragging,
      canDrop,
      disabledReorder,
      nextSpaceId,
      pinned,
      togglePinToSidebar,
      getRoom,
    },
    ref
  ) => {
    const mx = useMatrixClient();

    const spacePowerLevels = roomsPowerLevels.get(spaceItem.roomId);

    const draggingSpace =
      draggingItem?.roomId === spaceItem.roomId && draggingItem.parentId === spaceItem.parentId;

    const { parentId } = spaceItem;
    const parentPowerLevels = parentId ? roomsPowerLevels.get(parentId) : undefined;
    const parentCreators = parentId ? getRoomCreatorsForRoomId(mx, parentId) : undefined;
    const parentPermissions =
      parentCreators &&
      parentPowerLevels &&
      getRoomPermissionsAPI(parentCreators, parentPowerLevels);

    return (
      <Box direction="Column" gap="0" ref={ref}>
        <SpaceNavItemCard
          summary={summary}
          item={spaceItem}
          joined={allJoinedRooms.has(spaceItem.roomId)}
          categoryId={categoryId}
          canReorder={
            parentPowerLevels && !disabledReorder && parentPermissions
              ? parentPermissions.stateEvent(StateEvent.SpaceChild, mx.getSafeUserId())
              : false
          }
          options={
            parentId &&
            parentPowerLevels && (
              <HierarchyItemMenu
                item={{ ...spaceItem, parentId }}
                powerLevels={spacePowerLevels}
                joined={allJoinedRooms.has(spaceItem.roomId)}
                canEditChild={
                  !!parentPermissions?.stateEvent(StateEvent.SpaceChild, mx.getSafeUserId())
                }
                pinned={pinned}
                onTogglePin={togglePinToSidebar}
              />
            )
          }
          getRoom={getRoom}
          after={
            <AfterItemDropTarget
              item={spaceItem}
              nextRoomId={nextSpaceId}
              afterSpace
              canDrop={canDrop}
            />
          }
          onDragging={onDragging}
          data-dragging={draggingSpace}
        />
      </Box>
    );
  }
);
