import type { MouseEventHandler } from 'react';
import { useMemo } from 'react';
import type { Room } from '$types/matrix-sdk';
import { JoinRule, MatrixEvent, RelationType } from '$types/matrix-sdk';
import { Avatar, Box, Chip, Header, Text, config } from 'folds';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { MessagePreview, useRoomMessagePreviewRenderer } from '$components/message-preview';
import { SequenceCard } from '$components/sequence-card';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomAvatar, useRoomName } from '$hooks/useRoomMeta';
import { makeHighlightRegex } from '$plugins/react-custom-html-parser';
import { mxcUrlToHttp } from '$utils/matrix';
import type { UserProfile } from '$hooks/useUserProfile';
import type { ResultItem } from './useMessageSearch';

type SearchResultItemProps = {
  room: Room;
  item: ResultItem;
  renderContent: ReturnType<typeof useRoomMessagePreviewRenderer>;
  hour24Clock: boolean;
  dateFormatString: string;
  onOpen: (roomId: string, eventId: string) => void;
};

function SearchResultItem({
  room,
  item,
  renderContent,
  hour24Clock,
  dateFormatString,
  onOpen,
}: SearchResultItemProps) {
  const event = useMemo(() => new MatrixEvent(item.event), [item.event]);
  const sender = event.getSender() ?? '';
  const contextProfile = item.context?.profile_info?.[sender];
  const profile = useMemo<Partial<UserProfile> | undefined>(
    () =>
      contextProfile
        ? {
            displayName: contextProfile.displayname,
            avatarUrl: contextProfile.avatar_url,
          }
        : undefined,
    [contextProfile]
  );
  const relation = item.event.content['m.relates_to'];
  const openEventId =
    relation?.rel_type === RelationType.Replace ? relation.event_id : item.event.event_id;

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    if (openEventId) onOpen(room.roomId, openEventId);
  };

  return (
    <SequenceCard
      style={{ padding: config.space.S400 }}
      variant="SurfaceVariant"
      direction="Column"
    >
      <MessagePreview
        room={room}
        event={event}
        profile={profile}
        renderContent={renderContent}
        actions={
          <Chip onClick={handleOpen} variant="Secondary" radii="400">
            <Text size="T200">Open</Text>
          </Chip>
        }
        onOpen={handleOpen}
        hour24Clock={hour24Clock}
        dateFormatString={dateFormatString}
      />
    </SequenceCard>
  );
}

type SearchResultGroupProps = {
  room: Room;
  highlights: string[];
  items: ResultItem[];
  onOpen: (roomId: string, eventId: string) => void;
  hour24Clock: boolean;
  dateFormatString: string;
};

export function SearchResultGroup({
  room,
  highlights,
  items,
  onOpen,
  hour24Clock,
  dateFormatString,
}: SearchResultGroupProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const roomName = useRoomName(room);
  const roomAvatarMxc = useRoomAvatar(room);
  const highlightRegex = useMemo(() => makeHighlightRegex(highlights), [highlights]);
  const renderContent = useRoomMessagePreviewRenderer(room, { highlightRegex });

  return (
    <Box direction="Column" gap="200">
      <Header size="300">
        <Box gap="200" grow="Yes">
          <Avatar size="200" radii="300">
            <RoomAvatar
              roomId={room.roomId}
              src={
                roomAvatarMxc
                  ? (mxcUrlToHttp(mx, roomAvatarMxc, useAuthentication, 96, 96, 'crop') ??
                    undefined)
                  : undefined
              }
              alt={roomName}
              renderFallback={() => (
                <RoomIcon
                  size="50"
                  roomType={room.getType()}
                  joinRule={room.getJoinRule() ?? JoinRule.Restricted}
                  filled
                />
              )}
            />
          </Avatar>
          <Text size="H4" truncate>
            {roomName}
          </Text>
        </Box>
      </Header>
      <Box direction="Column" gap="100">
        {items.map((item) => (
          <SearchResultItem
            key={item.event.event_id}
            room={room}
            item={item}
            renderContent={renderContent}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
            onOpen={onOpen}
          />
        ))}
      </Box>
    </Box>
  );
}
