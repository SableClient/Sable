import { Avatar, Box, Chip, Icon, IconButton, Icons, Line, Text, config } from 'folds';
import { useAtomValue } from 'jotai';
import {
  useBookmarks,
  useArchivedBookmarks,
  toggleBookmark,
  restoreBookmark,
  permanentlyDeleteBookmark,
} from '$hooks/useBookmarks';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useGetRoom, useAllJoinedRoomsSet } from '$hooks/useGetRoom';
import { getMemberAvatarMxc, getMemberDisplayName } from '$utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { UserAvatar } from '$components/user-avatar';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { SequenceCard } from '$components/sequence-card';
import { AvatarBase, ModernLayout, Time, Username, UsernameBold } from '$components/message';
import { ContainerColor } from '$styles/ContainerColor.css';
import { EncryptedContent } from '$features/room/message';
import { nicknamesAtom } from '$state/nicknames';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

type BookmarksListProps = {
  onNavigate?: () => void;
};

export function BookmarksList({ onNavigate }: BookmarksListProps) {
  const mx = useMatrixClient();
  const bookmarks = useBookmarks();
  const archived = useArchivedBookmarks();
  const { navigateRoom } = useRoomNavigate();
  const useAuthentication = useMediaAuthentication();
  const allRoomsSet = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allRoomsSet);
  const nicknames = useAtomValue(nicknamesAtom);
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const handleOpen = (roomId: string, eventId: string) => {
    navigateRoom(roomId, eventId);
    onNavigate?.();
  };

  const handleRemove = (roomId: string, eventId: string) => {
    toggleBookmark(mx, roomId, eventId, bookmarks).catch(() => {});
  };

  const handleRestore = (entry: (typeof archived)[number]) => {
    restoreBookmark(mx, entry).catch(() => {});
  };

  const handlePermanentDelete = (entry: (typeof archived)[number]) => {
    const allIds = [...bookmarks.map((b) => b.id), ...archived.map((b) => b.id)];
    permanentlyDeleteBookmark(mx, entry, allIds).catch(() => {});
  };

  if (bookmarks.length === 0 && archived.length === 0) {
    return (
      <Box
        className={ContainerColor({ variant: 'SurfaceVariant' })}
        style={{
          padding: config.space.S300,
          borderRadius: config.radii.R400,
        }}
        direction="Column"
        gap="200"
      >
        <Text>No Bookmarks</Text>
        <Text size="T200">Bookmark messages from the message menu to save them here.</Text>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="100">
      {bookmarks.map((bookmark) => {
        const room = getRoom(bookmark.room_id);
        const event = room
          ?.getTimelineForEvent(bookmark.event_id)
          ?.getEvents()
          .find((e) => e.getId() === bookmark.event_id);

        const senderId = event?.getSender() ?? '';
        const displayName =
          (room && senderId ? getMemberDisplayName(room, senderId, nicknames) : undefined) ??
          getMxIdLocalPart(senderId) ??
          senderId;
        const senderAvatarMxc = room && senderId ? getMemberAvatarMxc(room, senderId) : undefined;
        const senderAvatarUrl = senderAvatarMxc
          ? (mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined)
          : undefined;

        return (
          <SequenceCard
            key={bookmark.event_id}
            style={{ padding: config.space.S400 }}
            variant="SurfaceVariant"
            direction="Column"
          >
            <ModernLayout
              before={
                <AvatarBase>
                  <Avatar size="300">
                    <UserAvatar
                      userId={senderId}
                      src={senderAvatarUrl}
                      alt={displayName}
                      renderFallback={() => <Icon size="200" src={Icons.User} filled />}
                    />
                  </Avatar>
                </AvatarBase>
              }
            >
              <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
                <Box gap="200" alignItems="Baseline">
                  <Box alignItems="Center" gap="200">
                    <Username>
                      <Text as="span" truncate>
                        <UsernameBold>{displayName || 'Unknown'}</UsernameBold>
                      </Text>
                    </Username>
                  </Box>
                  {event && (
                    <Time
                      ts={event.getTs()}
                      hour24Clock={hour24Clock}
                      dateFormatString={dateFormatString}
                    />
                  )}
                </Box>
                <Box shrink="No" gap="200" alignItems="Center">
                  <Chip
                    onClick={() => handleOpen(bookmark.room_id, bookmark.event_id)}
                    variant="Secondary"
                    radii="400"
                  >
                    <Text size="T200">Open</Text>
                  </Chip>
                  <IconButton
                    size="300"
                    radii="300"
                    variant="SurfaceVariant"
                    onClick={() => handleRemove(bookmark.room_id, bookmark.event_id)}
                    aria-label="Remove bookmark"
                  >
                    <Icon src={Icons.Cross} size="100" />
                  </IconButton>
                </Box>
              </Box>
              <Text size="T200" priority="300" truncate>
                in {room?.name ?? bookmark.room_id}
              </Text>
              {event ? (
                <EncryptedContent mEvent={event}>
                  {() => {
                    const content = event.getContent<{ body?: string }>();
                    return (
                      <Text size="T200" priority="300">
                        {content.body ?? 'Unknown content'}
                      </Text>
                    );
                  }}
                </EncryptedContent>
              ) : (
                <Text size="T200" priority="300">
                  Event not in local timeline
                </Text>
              )}
            </ModernLayout>
          </SequenceCard>
        );
      })}
      {archived.length > 0 && (
        <>
          <Box
            style={{ paddingTop: config.space.S300, paddingBottom: config.space.S100 }}
            alignItems="Center"
            gap="200"
          >
            <Line size="300" style={{ flex: 1 }} />
            <Box alignItems="Center" gap="100">
              <Icon src={Icons.Inbox} size="100" />
              <Text size="L400" priority="300">
                Archived
              </Text>
            </Box>
            <Line size="300" style={{ flex: 1 }} />
          </Box>
          {archived.map((entry) => {
            const room = getRoom(entry.room_id);
            const event = room
              ?.getTimelineForEvent(entry.event_id)
              ?.getEvents()
              .find((e) => e.getId() === entry.event_id);

            const senderId = event?.getSender() ?? '';
            const displayName =
              (room && senderId ? getMemberDisplayName(room, senderId, nicknames) : undefined) ??
              getMxIdLocalPart(senderId) ??
              senderId;
            const senderAvatarMxc =
              room && senderId ? getMemberAvatarMxc(room, senderId) : undefined;
            const senderAvatarUrl = senderAvatarMxc
              ? (mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined)
              : undefined;

            return (
              <SequenceCard
                key={entry.event_id}
                style={{ padding: config.space.S400, opacity: 0.7 }}
                variant="SurfaceVariant"
                direction="Column"
              >
                <ModernLayout
                  before={
                    <AvatarBase>
                      <Avatar size="300">
                        <UserAvatar
                          userId={senderId}
                          src={senderAvatarUrl}
                          alt={displayName}
                          renderFallback={() => <Icon size="200" src={Icons.User} filled />}
                        />
                      </Avatar>
                    </AvatarBase>
                  }
                >
                  <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
                    <Box gap="200" alignItems="Baseline">
                      <Box alignItems="Center" gap="200">
                        <Username>
                          <Text as="span" truncate>
                            <UsernameBold>{displayName || 'Unknown'}</UsernameBold>
                          </Text>
                        </Username>
                      </Box>
                      {event && (
                        <Time
                          ts={event.getTs()}
                          hour24Clock={hour24Clock}
                          dateFormatString={dateFormatString}
                        />
                      )}
                    </Box>
                    <Box shrink="No" gap="200" alignItems="Center">
                      <Chip
                        onClick={() => handleOpen(entry.room_id, entry.event_id)}
                        variant="Secondary"
                        radii="400"
                      >
                        <Text size="T200">Open</Text>
                      </Chip>
                      <IconButton
                        size="300"
                        radii="300"
                        variant="SurfaceVariant"
                        onClick={() => handleRestore(entry)}
                        aria-label="Restore bookmark"
                        title="Restore"
                      >
                        <Icon src={Icons.ReplyArrow} size="100" />
                      </IconButton>
                      <IconButton
                        size="300"
                        radii="300"
                        variant="SurfaceVariant"
                        onClick={() => handlePermanentDelete(entry)}
                        aria-label="Permanently delete bookmark"
                        title="Delete permanently"
                      >
                        <Icon src={Icons.Delete} size="100" />
                      </IconButton>
                    </Box>
                  </Box>
                  <Text size="T200" priority="300" truncate>
                    in {room?.name ?? entry.room_id}
                  </Text>
                  {event ? (
                    <EncryptedContent mEvent={event}>
                      {() => {
                        const content = event.getContent<{ body?: string }>();
                        return (
                          <Text size="T200" priority="300">
                            {content.body ?? 'Unknown content'}
                          </Text>
                        );
                      }}
                    </EncryptedContent>
                  ) : (
                    <Text size="T200" priority="300">
                      Event not in local timeline
                    </Text>
                  )}
                </ModernLayout>
              </SequenceCard>
            );
          })}
        </>
      )}
    </Box>
  );
}
