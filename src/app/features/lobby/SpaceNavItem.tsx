import { ReactNode, useRef } from 'react';
import { Avatar, Badge, Box, Chip, Icon, Icons, as, Text } from 'folds';
import classNames from 'classnames';
import { IHierarchyRoom, MatrixClient, Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getCanonicalAliasOrRoomId, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { HierarchyItem } from '$hooks/useSpaceHierarchy';
import { LocalRoomSummaryLoader } from '$components/RoomSummaryLoader';
import { getRoomAvatarUrl } from '$utils/room';
import { RoomAvatar } from '$components/room-avatar';
import { nameInitials } from '$utils/common';
import { useNavigate } from 'react-router-dom';
import { getSpaceLobbyPath } from '$pages/pathUtils';
import { InaccessibleSpaceProfile, UnjoinedSpaceProfile } from './SpaceItem';
import * as css from './SpaceNavItem.css';
import { useDraggableItem } from './DnD';

type SpaceProfileProps = {
  roomId: string;
  name: string;
  avatarUrl?: string;
  suggested?: boolean;
  categoryId: string;
  mx: MatrixClient;
};
function SpaceNavProfile({
  roomId,
  name,
  avatarUrl,
  suggested,
  categoryId,
  mx,
}: SpaceProfileProps) {
  const navigate = useNavigate();
  return (
    <Chip
      data-category-id={categoryId}
      className={css.HeaderChip}
      variant="Surface"
      size="500"
      onClick={() => navigate(getSpaceLobbyPath(getCanonicalAliasOrRoomId(mx, roomId)))}
      before={
        <Avatar size="200" radii="300">
          <RoomAvatar
            roomId={roomId}
            src={avatarUrl}
            alt={name}
            renderFallback={() => (
              <Text as="span" size="H6">
                {nameInitials(name)}
              </Text>
            )}
          />
        </Avatar>
      }
      after={<Icon src={Icons.Space} size="50" />}
    >
      <Box alignItems="Center" gap="200">
        <Text size="H4" truncate>
          {name}
        </Text>
        {suggested && (
          <Badge variant="Success" fill="Soft" radii="Pill" outlined>
            <Text size="L400">Suggested</Text>
          </Badge>
        )}
      </Box>
    </Chip>
  );
}

type SpaceNavItemCardProps = {
  summary: IHierarchyRoom | undefined;
  item: HierarchyItem;
  joined?: boolean;
  categoryId: string;
  options?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  canReorder: boolean;
  getRoom: (roomId: string) => Room | undefined;
  onDragging: (item?: HierarchyItem) => void;
};
export const SpaceNavItemCard = as<'div', SpaceNavItemCardProps>(
  (
    {
      className,
      summary,
      joined,
      categoryId,
      item,
      options,
      before,
      after,
      canReorder,
      onDragging,
      getRoom,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const { roomId, content } = item;
    // const spaceNav = getRoom(roomId);
    const targetRef = useRef<HTMLDivElement>(null);
    useDraggableItem(item, targetRef, onDragging);
    const space = getRoom(item.roomId);

    return (
      <Box
        shrink="No"
        alignItems="Center"
        gap="200"
        className={classNames(css.SpaceItemCard(), className)}
        {...props}
        ref={ref}
      >
        {before}
        <Box grow="Yes" gap="100" alignItems="Inherit" justifyContent="SpaceBetween">
          <Box ref={canReorder ? targetRef : null}>
            {space ? (
              <LocalRoomSummaryLoader room={space}>
                {(localSummary) => (
                  <SpaceNavProfile
                    roomId={roomId}
                    name={localSummary.name}
                    avatarUrl={getRoomAvatarUrl(mx, space, 96, useAuthentication)}
                    suggested={content.suggested}
                    categoryId={categoryId}
                    mx={mx}
                  />
                )}
              </LocalRoomSummaryLoader>
            ) : (
              <>
                {!summary && (
                  <InaccessibleSpaceProfile
                    roomId={item.roomId}
                    suggested={item.content.suggested}
                  />
                )}
                {summary && (
                  <UnjoinedSpaceProfile
                    roomId={roomId}
                    via={item.content.via}
                    name={summary.name || summary.canonical_alias || roomId}
                    avatarUrl={
                      summary?.avatar_url
                        ? (mxcUrlToHttp(
                            mx,
                            summary.avatar_url,
                            useAuthentication,
                            96,
                            96,
                            'crop'
                          ) ?? undefined)
                        : undefined
                    }
                    suggested={content.suggested}
                  />
                )}
              </>
            )}
          </Box>
        </Box>
        {options}
        {after}
      </Box>
    );
  }
);
