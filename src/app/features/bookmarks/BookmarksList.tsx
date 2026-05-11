import { Avatar, Box, Chip, Icon, IconButton, Icons, Input, Line, Text, config } from 'folds';
import { useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';
import {
  useBookmarkList,
  useBookmarkDeletedList,
  useBookmarkActions,
  useBookmarkReminders,
  useBookmarkReminderActions,
} from '$features/bookmarks/useBookmarks';
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
import type { BookmarkItemContent } from '$features/bookmarks/bookmarkDomain';

type BookmarksListProps = {
  onNavigate?: () => void;
};

export function BookmarksList({ onNavigate }: BookmarksListProps) {
  const mx = useMatrixClient();
  const bookmarks = useBookmarkList();
  const archived = useBookmarkDeletedList();
  const { remove, restore, purge } = useBookmarkActions();
  const reminders = useBookmarkReminders();
  const { setReminder, clearReminder } = useBookmarkReminderActions();
  const [enableBookmarkReminders] = useSetting(settingsAtom, 'enableBookmarkReminders');
  // Track which bookmark has the reminder picker open, and the current input value
  const [reminderOpenId, setReminderOpenId] = useState<string | null>(null);
  const [reminderInputValue, setReminderInputValue] = useState('');

  const getReminderForBookmark = useCallback(
    (bookmarkId: string) => reminders.find((r) => r.bookmarkId === bookmarkId),
    [reminders]
  );

  const handleOpenReminderPicker = (bookmark: BookmarkItemContent) => {
    const existing = getReminderForBookmark(bookmark.bookmark_id);
    const defaultValue = existing ? new Date(existing.remindAt).toISOString().slice(0, 16) : '';
    setReminderInputValue(defaultValue);
    setReminderOpenId((prev) => (prev === bookmark.bookmark_id ? null : bookmark.bookmark_id));
  };

  const handleSaveReminder = async (bookmark: BookmarkItemContent) => {
    if (!reminderInputValue) return;
    const remindAt = new Date(reminderInputValue).getTime();
    if (Number.isNaN(remindAt)) return;
    await setReminder({
      bookmarkId: bookmark.bookmark_id,
      eventId: bookmark.event_id,
      roomId: bookmark.room_id,
      remindAt,
      userId: mx.getUserId() ?? '',
    });
    setReminderOpenId(null);
  };

  const handleClearReminder = async (bookmarkId: string) => {
    await clearReminder(bookmarkId);
    setReminderOpenId(null);
  };
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

  const handleRemove = (bookmark: BookmarkItemContent) => {
    remove(bookmark.bookmark_id).catch(console.warn);
  };

  const handleRestore = (entry: BookmarkItemContent) => {
    restore(entry).catch(console.warn);
  };

  const handlePermanentDelete = (entry: BookmarkItemContent) => {
    purge(entry.bookmark_id).catch(console.warn);
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

        // Fall back to cached account-data fields when event isn't in the local timeline
        const senderId = event?.getSender() ?? bookmark.sender ?? '';
        const displayName =
          (room && senderId ? getMemberDisplayName(room, senderId, nicknames) : undefined) ??
          getMxIdLocalPart(senderId) ??
          senderId;
        const senderAvatarMxc = room && senderId ? getMemberAvatarMxc(room, senderId) : undefined;
        const senderAvatarUrl = senderAvatarMxc
          ? (mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined)
          : undefined;
        const displayTs = event?.getTs() ?? bookmark.event_ts;
        const roomName = room?.name ?? bookmark.room_name ?? bookmark.room_id;

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
                  <Time
                    ts={displayTs}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                  />
                </Box>
                <Box shrink="No" gap="200" alignItems="Center">
                  <Chip
                    onClick={() => handleOpen(bookmark.room_id, bookmark.event_id)}
                    variant="Secondary"
                    radii="400"
                  >
                    <Text size="T200">Open</Text>
                  </Chip>
                  {enableBookmarkReminders && (
                    <IconButton
                      size="300"
                      radii="300"
                      variant={
                        getReminderForBookmark(bookmark.bookmark_id) ? 'Primary' : 'SurfaceVariant'
                      }
                      onClick={() => handleOpenReminderPicker(bookmark)}
                      aria-label={
                        getReminderForBookmark(bookmark.bookmark_id)
                          ? 'Edit reminder'
                          : 'Set reminder'
                      }
                      title={
                        getReminderForBookmark(bookmark.bookmark_id)
                          ? 'Edit reminder'
                          : 'Set reminder'
                      }
                    >
                      <Icon
                        src={
                          getReminderForBookmark(bookmark.bookmark_id) ? Icons.BellRing : Icons.Bell
                        }
                        size="100"
                      />
                    </IconButton>
                  )}
                  <IconButton
                    size="300"
                    radii="300"
                    variant="SurfaceVariant"
                    onClick={() => handleRemove(bookmark)}
                    aria-label="Remove bookmark"
                  >
                    <Icon src={Icons.Cross} size="100" />
                  </IconButton>
                </Box>
              </Box>
              <Text size="T200" priority="300" truncate>
                in {roomName}
              </Text>
              {event ? (
                <EncryptedContent mEvent={event}>
                  {() => {
                    const content = event.getContent<{ body?: string }>();
                    return (
                      <Text size="T200" priority="300">
                        {content.body ?? bookmark.body_preview ?? 'Unknown content'}
                      </Text>
                    );
                  }}
                </EncryptedContent>
              ) : (
                <Text size="T200" priority="300">
                  {bookmark.body_preview ?? 'Message not in local timeline'}
                </Text>
              )}
            </ModernLayout>
            {enableBookmarkReminders && reminderOpenId === bookmark.bookmark_id && (
              <Box
                direction="Row"
                gap="200"
                alignItems="Center"
                style={{ paddingTop: config.space.S200 }}
              >
                <Input
                  type="datetime-local"
                  value={reminderInputValue}
                  onChange={(e) => setReminderInputValue(e.currentTarget.value)}
                  style={{ flex: 1 }}
                  size="300"
                />
                <Chip
                  onClick={() => handleSaveReminder(bookmark).catch(console.warn)}
                  variant="Primary"
                  radii="400"
                  as="button"
                >
                  <Text size="T200">Set</Text>
                </Chip>
                {getReminderForBookmark(bookmark.bookmark_id) && (
                  <Chip
                    onClick={() => handleClearReminder(bookmark.bookmark_id).catch(console.warn)}
                    variant="Critical"
                    radii="400"
                    as="button"
                  >
                    <Text size="T200">Clear</Text>
                  </Chip>
                )}
              </Box>
            )}
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

            // Fall back to cached account-data fields when event isn't in the local timeline
            const senderId = event?.getSender() ?? entry.sender ?? '';
            const displayName =
              (room && senderId ? getMemberDisplayName(room, senderId, nicknames) : undefined) ??
              getMxIdLocalPart(senderId) ??
              senderId;
            const senderAvatarMxc =
              room && senderId ? getMemberAvatarMxc(room, senderId) : undefined;
            const senderAvatarUrl = senderAvatarMxc
              ? (mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined)
              : undefined;
            const displayTs = event?.getTs() ?? entry.event_ts;
            const roomName = room?.name ?? entry.room_name ?? entry.room_id;

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
                      <Time
                        ts={displayTs}
                        hour24Clock={hour24Clock}
                        dateFormatString={dateFormatString}
                      />
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
                    in {roomName}
                  </Text>
                  {event ? (
                    <EncryptedContent mEvent={event}>
                      {() => {
                        const content = event.getContent<{ body?: string }>();
                        return (
                          <Text size="T200" priority="300">
                            {content.body ?? entry.body_preview ?? 'Unknown content'}
                          </Text>
                        );
                      }}
                    </EncryptedContent>
                  ) : (
                    <Text size="T200" priority="300">
                      {entry.body_preview ?? 'Message not in local timeline'}
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
