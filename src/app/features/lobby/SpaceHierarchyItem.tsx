import type { MouseEventHandler } from 'react';
import { forwardRef, useEffect, useMemo } from 'react';
import type { Room, IHierarchyRoom } from '$types/matrix-sdk';
import { Box, config, Text } from 'folds';
import type {
  HierarchyItem,
  HierarchyItemRoom,
  HierarchyItemSpace,
} from '$hooks/useSpaceHierarchy';
import { useFetchSpaceHierarchyLevel } from '$hooks/useSpaceHierarchy';
import type { IPowerLevels } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { ErrorCode } from '../../cs-errorcode';
import { SequenceCard } from '$components/sequence-card';
import { getRoomCreatorsForRoomId } from '$hooks/useRoomCreators';
import { getRoomPermissionsAPI } from '$hooks/useRoomPermissions';
import { SpaceItemCard } from './SpaceItem';
import type { CanDropCallback } from './DnD';
import { AfterItemDropTarget } from './DnD';
import { HierarchyItemMenu } from './HierarchyItemMenu';
import { RoomItemCard } from './RoomItem';
import { EventType, MatrixError, RoomType } from '$types/matrix-sdk';

type SpaceHierarchyItemProps = {
  summary: IHierarchyRoom | undefined;
  spaceItem: HierarchyItemSpace;
  roomItems?: HierarchyItemRoom[];
  allJoinedRooms: Set<string>;
  mDirects: Set<string>;
  roomsPowerLevels: Map<string, IPowerLevels>;
  categoryId: string;
  closed: boolean;
  handleClose: MouseEventHandler<HTMLButtonElement>;
  draggingItem?: HierarchyItem;
  onDragging: (item?: HierarchyItem) => void;
  canDrop: CanDropCallback;
  disabledReorder?: boolean;
  nextSpaceId?: string;
  getRoom: (roomId: string) => Room | undefined;
  pinned: boolean;
  togglePinToSidebar: (roomId: string) => void;
  onSpacesFound: (spaceItems: IHierarchyRoom[]) => void;
  onOpenRoom: MouseEventHandler<HTMLButtonElement>;
};
export const SpaceHierarchyItem = forwardRef<HTMLDivElement, SpaceHierarchyItemProps>(
  (
    {
      summary,
      spaceItem,
      roomItems,
      allJoinedRooms,
      mDirects,
      roomsPowerLevels,
      categoryId,
      closed,
      handleClose,
      draggingItem,
      onDragging,
      canDrop,
      disabledReorder,
      nextSpaceId,
      getRoom,
      pinned,
      togglePinToSidebar,
      onOpenRoom,
      onSpacesFound,
    },
    ref
  ) => {
    const mx = useMatrixClient();

    const { fetching, error, rooms } = useFetchSpaceHierarchyLevel(spaceItem.roomId, true);

    const subspaces = useMemo(() => {
      const s: Map<string, IHierarchyRoom> = new Map();
      rooms.forEach((r) => {
        if (r.room_type === RoomType.Space) {
          s.set(r.room_id, r);
        }
      });
      return s;
    }, [rooms]);

    const spacePowerLevels = roomsPowerLevels.get(spaceItem.roomId);
    const spaceCreators = getRoomCreatorsForRoomId(mx, spaceItem.roomId);
    const spacePermissions =
      spacePowerLevels && getRoomPermissionsAPI(spaceCreators, spacePowerLevels);

    const draggingSpace =
      draggingItem?.roomId === spaceItem.roomId && draggingItem.parentId === spaceItem.parentId;

    const { parentId } = spaceItem;
    const parentPowerLevels = parentId ? roomsPowerLevels.get(parentId) : undefined;
    const parentCreators = parentId ? getRoomCreatorsForRoomId(mx, parentId) : undefined;
    const parentPermissions =
      parentCreators &&
      parentPowerLevels &&
      getRoomPermissionsAPI(parentCreators, parentPowerLevels);

    useEffect(() => {
      onSpacesFound(Array.from(subspaces.values()));
    }, [subspaces, onSpacesFound]);

    let childItems: HierarchyItemRoom[] | undefined = roomItems?.filter(
      (i) => !subspaces.has(i.roomId)
    );
    if (!spacePermissions?.stateEvent(EventType.SpaceChild, mx.getSafeUserId())) {
      // hide unknown rooms for normal user
      childItems = childItems?.filter((i) => {
        const forbidden = error instanceof MatrixError && error.errcode === ErrorCode.M_FORBIDDEN;
        const inaccessibleRoom = !rooms.get(i.roomId) && !fetching && (error ? forbidden : true);
        return !inaccessibleRoom;
      });
    }

    return (
      <Box direction="Column" gap="0" ref={ref}>
        <SpaceItemCard
          summary={rooms.get(spaceItem.roomId) ?? summary}
          loading={fetching}
          item={spaceItem}
          joined={allJoinedRooms.has(spaceItem.roomId)}
          categoryId={categoryId}
          closed={closed}
          handleClose={handleClose}
          getRoom={getRoom}
          canEditChild={!!spacePermissions?.stateEvent(EventType.SpaceChild, mx.getSafeUserId())}
          canReorder={
            parentPowerLevels && !disabledReorder && parentPermissions
              ? parentPermissions.stateEvent(EventType.SpaceChild, mx.getSafeUserId())
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
                  !!parentPermissions?.stateEvent(EventType.SpaceChild, mx.getSafeUserId())
                }
                pinned={pinned}
                onTogglePin={togglePinToSidebar}
              />
            )
          }
          after={
            <AfterItemDropTarget
              item={spaceItem}
              nextRoomId={closed ? nextSpaceId : childItems?.[0]?.roomId}
              afterSpace
              canDrop={canDrop}
            />
          }
          onDragging={onDragging}
          data-dragging={draggingSpace}
        />
        {childItems && childItems.length > 0 ? (
          <Box direction="Column" gap="0">
            {childItems.map((roomItem, index) => {
              const roomSummary = rooms.get(roomItem.roomId);

              const roomPowerLevels = roomsPowerLevels.get(roomItem.roomId) ?? {};

              const lastItem = index === childItems.length;
              const nextRoomId = lastItem ? nextSpaceId : childItems[index + 1]?.roomId;

              const roomDragging =
                draggingItem?.roomId === roomItem.roomId &&
                draggingItem.parentId === roomItem.parentId;

              return (
                <RoomItemCard
                  key={roomItem.roomId}
                  item={roomItem}
                  loading={fetching}
                  error={error}
                  summary={roomSummary}
                  dm={mDirects.has(roomItem.roomId)}
                  onOpen={onOpenRoom}
                  getRoom={getRoom}
                  canReorder={
                    !!spacePermissions?.stateEvent(EventType.SpaceChild, mx.getSafeUserId()) &&
                    !disabledReorder
                  }
                  options={
                    <HierarchyItemMenu
                      item={roomItem}
                      powerLevels={roomPowerLevels}
                      joined={allJoinedRooms.has(roomItem.roomId)}
                      canEditChild={
                        !!spacePermissions?.stateEvent(EventType.SpaceChild, mx.getSafeUserId())
                      }
                    />
                  }
                  after={
                    <AfterItemDropTarget
                      item={roomItem}
                      nextRoomId={nextRoomId}
                      canDrop={canDrop}
                    />
                  }
                  data-dragging={roomDragging}
                  onDragging={onDragging}
                />
              );
            })}
          </Box>
        ) : (
          childItems && (
            <SequenceCard variant="SurfaceVariant" gap="300" alignItems="Center" radii="300">
              <Box
                grow="Yes"
                style={{
                  padding: config.space.S100,
                }}
                direction="Column"
                alignItems="Center"
                justifyContent="Center"
                gap="100"
              >
                <Text align="Center" size="T300" priority="300">
                  This space does not contain any rooms.
                </Text>
              </Box>
            </SequenceCard>
          )
        )}
      </Box>
    );
  }
);
