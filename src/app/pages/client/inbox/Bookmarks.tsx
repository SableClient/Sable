import type { ChangeEventHandler, MouseEventHandler, ReactNode } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { ClientEvent, JoinRule } from 'matrix-js-sdk';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Scroll,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import { useAtomValue } from 'jotai';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroEmpty,
  PageHeroSection,
} from '../../../components/page';
import {
  useBookmarkList,
  useBookmarkLoading,
  useBookmarkActions,
} from '../../../hooks/useBookmarks';
import type { BookmarkItemContent } from '$types/matrix-sdk-events';
import { SequenceCard } from '../../../components/sequence-card';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getMxIdLocalPart } from '../../../utils/matrix';
import { Time } from '../../../components/message';
import { RoomAvatar, RoomIcon } from '../../../components/room-avatar';
import { getRoomAvatarUrl } from '../../../utils/room/display';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { profilesCacheAtom } from '../../../state/userRoomProfile';
import { highlightText, makeHighlightRegex } from '../../../plugins/react-custom-html-parser';
import { useRoomEvent } from '$hooks/useRoomEvent';
import { MessagePreview, useRoomMessagePreviewRenderer } from '$components/message-preview';
import { MATRIX_SABLE_UNSTABLE_BOOKMARKS_INDEX_EVENT } from '$unstable/prefixes';
import { useDebounce } from '$hooks/useDebounce';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';

type RemoveBookmarkDialogProps = {
  open: boolean;
  renderMatrixEvent: () => ReactNode;
  onConfirm: () => void;
  onClose: () => void;
};
function RemoveBookmarkDialog({
  open,
  renderMatrixEvent,
  onConfirm,
  onClose,
}: RemoveBookmarkDialogProps) {
  return (
    <ModalOverlay open={open} requestClose={onClose}>
      <Dialog variant="Surface">
        <Header
          style={{
            padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
            borderBottomWidth: config.borderWidth.B300,
          }}
          variant="Surface"
          size="500"
        >
          <Box grow="Yes">
            <Text size="H4">Remove Bookmark</Text>
          </Box>
          <IconButton size="300" onClick={onClose} radii="300">
            <Icon src={Icons.Cross} />
          </IconButton>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          <Text priority="400">Are you sure you want to remove this bookmark?</Text>
          <Box
            style={{
              padding: config.space.S200,
              borderRadius: config.radii.R300,
            }}
            direction="Column"
            gap="200"
          >
            {renderMatrixEvent()}
          </Box>
          <Button variant="Critical" onClick={onConfirm}>
            <Text size="B400">Remove</Text>
          </Button>
        </Box>
      </Dialog>
    </ModalOverlay>
  );
}

type BookmarkItemRowBodyFallbackProps = {
  item: BookmarkItemContent;
  highlightRegex?: RegExp;
};

function BookmarkItemRowBodyFallback({ item, highlightRegex }: BookmarkItemRowBodyFallbackProps) {
  return (
    <Text size="T400" style={{ whiteSpace: 'pre-wrap' }}>
      {item.body_preview
        ? highlightRegex
          ? highlightText(highlightRegex, [item.body_preview])
          : item.body_preview
        : 'This bookmark has no preview'}
    </Text>
  );
}

type BookmarkItemRowProps = {
  item: BookmarkItemContent;
  room: Room;
  hour24Clock: boolean;
  dateFormatString: string;
  onOpen: (eventId: string) => void;
  onRemove: (bookmarkId: string) => void;
  highlightRegex?: RegExp;
};

function BookmarkItemRow({
  item,
  room,
  hour24Clock,
  dateFormatString,
  onOpen,
  onRemove,
  highlightRegex,
}: BookmarkItemRowProps) {
  const event = useRoomEvent(room, item.event_id);
  const renderContent = useRoomMessagePreviewRenderer(room, { highlightRegex });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmRemove = () => {
    setConfirmOpen(false);
    onRemove(item.bookmark_id);
  };

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    onOpen(item.event_id);
  };

  const actions = (
    <Box gap="200" alignItems="Center" shrink="Yes" wrap="WrapReverse" justifyContent="End">
      <Box gap="100" alignItems="Center">
        <Icon size="50" src={Icons.Bookmark} />
        <Time
          ts={item.bookmarked_ts}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      </Box>
      <Box gap="200" alignItems="Center">
        <Chip onClick={handleOpen} variant="Secondary" radii="400">
          <Text size="T200">Jump</Text>
        </Chip>
        <IconButton
          onClick={(evt: React.MouseEvent) => {
            evt.stopPropagation();
            setConfirmOpen(true);
          }}
          size="300"
          radii="300"
          aria-label="Remove bookmark"
          style={{ color: color.Critical.Main }}
        >
          <Icon src={Icons.Delete} size="100" />
        </IconButton>
      </Box>
    </Box>
  );

  return (
    <>
      <RemoveBookmarkDialog
        open={confirmOpen}
        onConfirm={handleConfirmRemove}
        renderMatrixEvent={() =>
          event ? (
            <MessagePreview
              room={room}
              event={event}
              renderContent={renderContent}
              onOpen={handleOpen}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
            />
          ) : (
            <BookmarkItemRowBodyFallback item={item} />
          )
        }
        onClose={() => setConfirmOpen(false)}
      />
      <SequenceCard
        style={{ padding: config.space.S400 }}
        variant="SurfaceVariant"
        direction="Column"
      >
        {event ? (
          <MessagePreview
            room={room}
            event={event}
            renderContent={renderContent}
            actions={actions}
            onOpen={handleOpen}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        ) : (
          <Box direction="Column" gap="200">
            {actions}
            <BookmarkItemRowBodyFallback item={item} highlightRegex={highlightRegex} />
          </Box>
        )}
      </SequenceCard>
    </>
  );
}

function UnavailableBookmarkItemRow({
  item,
  displayName,
  hour24Clock,
  dateFormatString,
  onOpen,
  onRemove,
  highlightRegex,
}: Omit<BookmarkItemRowProps, 'room' | 'onOpen'> & {
  displayName: string;
  onOpen: (eventId: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    onOpen(item.event_id);
  };
  return (
    <>
      <RemoveBookmarkDialog
        open={confirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove(item.bookmark_id);
        }}
        renderMatrixEvent={() => <BookmarkItemRowBodyFallback item={item} />}
        onClose={() => setConfirmOpen(false)}
      />
      <SequenceCard
        style={{ padding: config.space.S400 }}
        variant="SurfaceVariant"
        direction="Column"
        gap="200"
      >
        <Box justifyContent="SpaceBetween" alignItems="Center" gap="200">
          <Text size="T300" truncate>
            <b>{displayName}</b>
          </Text>
          <Box gap="200" alignItems="Center">
            <Time
              ts={item.bookmarked_ts}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
            />
            <Chip onClick={handleOpen} variant="Secondary" radii="400">
              <Text size="T200">Jump</Text>
            </Chip>
            <IconButton
              onClick={() => setConfirmOpen(true)}
              size="300"
              radii="300"
              aria-label="Remove bookmark"
              style={{ color: color.Critical.Main }}
            >
              <Icon src={Icons.Delete} size="100" />
            </IconButton>
          </Box>
        </Box>
        <BookmarkItemRowBodyFallback item={item} highlightRegex={highlightRegex} />
      </SequenceCard>
    </>
  );
}

type BookmarkResultGroupProps = {
  roomId: string;
  roomName?: string;
  items: BookmarkItemContent[];
  onOpen: (roomId: string, eventId: string) => void;
  onRemove: (bookmarkId: string) => void;
  hour24Clock: boolean;
  dateFormatString: string;
  highlightRegex?: RegExp;
};
function BookmarkResultGroup({
  roomId,
  roomName,
  items,
  onOpen,
  onRemove,
  hour24Clock,
  dateFormatString,
  highlightRegex,
}: BookmarkResultGroupProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const room = mx.getRoom(roomId);

  const cachedProfiles = useAtomValue(profilesCacheAtom);
  return (
    <Box direction="Column" gap="200">
      <Header size="300">
        <Box gap="200" grow="Yes">
          <Avatar size="200" radii="300">
            {room ? (
              <RoomAvatar
                roomId={roomId}
                src={getRoomAvatarUrl(mx, room, 96, useAuthentication)}
                alt={room.name}
                renderFallback={() => (
                  <RoomIcon
                    size="50"
                    roomType={room.getType()}
                    joinRule={room.getJoinRule() ?? JoinRule.Restricted}
                    filled
                  />
                )}
              />
            ) : (
              <RoomIcon size="50" joinRule={JoinRule.Restricted} filled />
            )}
          </Avatar>
          <Text size="H4" truncate>
            {room?.name ?? roomName ?? roomId}
          </Text>
        </Box>
      </Header>
      <Box direction="Column" gap="100">
        {items.map((item) => {
          if (room) {
            return (
              <BookmarkItemRow
                key={item.bookmark_id}
                item={item}
                room={room}
                hour24Clock={hour24Clock}
                dateFormatString={dateFormatString}
                onOpen={(eventId) => onOpen(roomId, eventId)}
                onRemove={onRemove}
                highlightRegex={highlightRegex}
              />
            );
          }
          const sender = item.sender ?? '';
          const displayName =
            cachedProfiles[sender]?.displayName ?? getMxIdLocalPart(sender) ?? sender ?? 'Unknown';
          return (
            <UnavailableBookmarkItemRow
              key={item.bookmark_id}
              item={item}
              displayName={displayName}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
              onOpen={(eventId) => onOpen(roomId, eventId)}
              onRemove={onRemove}
              highlightRegex={highlightRegex}
            />
          );
        })}
      </Box>
    </Box>
  );
}

type BookmarkFilterInputProps = {
  active?: boolean;
  loading?: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onChange: ChangeEventHandler<HTMLInputElement>;
};
function BookmarkFilterInput({
  active,
  loading,
  searchInputRef,
  onChange,
}: BookmarkFilterInputProps) {
  return (
    <Box as="form" direction="Column" gap="100">
      <span data-spacing-node />
      <Text size="L400">Search</Text>
      <Input
        ref={searchInputRef}
        style={{ paddingRight: config.space.S300 }}
        onChange={onChange}
        name="searchInput"
        autoFocus
        size="500"
        variant="Background"
        placeholder="Search for keyword"
        autoComplete="off"
        before={
          active && loading ? (
            <Spinner variant="Secondary" size="200" />
          ) : (
            <Icon size="200" src={Icons.Search} />
          )
        }
      />
    </Box>
  );
}

export function Bookmarks() {
  const mx = useMatrixClient();
  const bookmarks = useBookmarkList();
  const loading = useBookmarkLoading();
  const { refresh, remove } = useBookmarkActions();
  const { navigateRoom } = useRoomNavigate();
  const screenSize = useScreenSizeContext();

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterTerm, setFilterTerm] = useState<string | undefined>();

  const handleAccountData = useCallback(
    (event: MatrixEvent) => {
      if (event.getType() === MATRIX_SABLE_UNSTABLE_BOOKMARKS_INDEX_EVENT) {
        refresh();
      }
    },
    [refresh]
  );

  useEffect(() => {
    refresh();
    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx, refresh, handleAccountData]);

  // Filter bookmarks by search term
  const filtered = useMemo(() => {
    if (!filterTerm) return bookmarks;
    const lower = filterTerm.toLowerCase();
    return bookmarks.filter(
      (b) =>
        (b.body_preview && b.body_preview.toLowerCase().includes(lower)) ||
        (b.room_name && b.room_name.toLowerCase().includes(lower)) ||
        (b.sender && b.sender.toLowerCase().includes(lower))
    );
  }, [bookmarks, filterTerm]);

  const highlightRegex = useMemo(
    () => (filterTerm ? makeHighlightRegex([filterTerm]) : undefined),
    [filterTerm]
  );

  // Group filtered bookmarks by room
  const groups = useMemo(() => {
    const map = filtered.reduce((acc, item) => {
      const existing = acc.get(item.room_id);
      if (existing) {
        existing.push(item);
      } else {
        acc.set(item.room_id, [item]);
      }
      return acc;
    }, new Map<string, BookmarkItemContent[]>());
    return Array.from(map.entries());
  }, [filtered]);

  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useDebounce(
    (evt) => {
      if (evt.target.value) setFilterTerm(evt.target.value);
      else setFilterTerm(undefined);
    },
    { wait: 200 }
  );

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" alignItems="Center" gap="200">
          <Box grow="Yes" basis="No">
            {screenSize === ScreenSize.Mobile && (
              <BackRouteHandler>
                {(onBack) => (
                  <IconButton onClick={onBack}>
                    <Icon src={Icons.ArrowLeft} />
                  </IconButton>
                )}
              </BackRouteHandler>
            )}
          </Box>
          <Box justifyContent="Center" alignItems="Center" gap="200">
            {screenSize !== ScreenSize.Mobile && <Icon size="400" src={Icons.Bookmark} />}
            <Text size="H3" truncate>
              Bookmarks
            </Text>
          </Box>
          <Box grow="Yes" basis="No" />
        </Box>
      </PageHeader>
      <Box style={{ position: 'relative' }} grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <Box direction="Column" gap="700">
                <Box direction="Column" gap="300">
                  <BookmarkFilterInput
                    active={!!filterTerm}
                    loading={loading}
                    searchInputRef={searchInputRef}
                    onChange={handleOnChange}
                  />
                </Box>

                {!filterTerm && bookmarks.length === 0 && !loading && (
                  <PageHeroEmpty>
                    <PageHeroSection>
                      <PageHero
                        icon={<Icon size="600" src={Icons.Bookmark} />}
                        title="Bookmarks"
                        subTitle='Right-click a message and select "Bookmark Message" to save it here.'
                      />
                    </PageHeroSection>
                  </PageHeroEmpty>
                )}

                {loading && bookmarks.length === 0 && (
                  <Box direction="Column" gap="100">
                    {[...Array(4).keys()].map((key) => (
                      <SequenceCard
                        variant="SurfaceVariant"
                        key={key}
                        style={{ minHeight: toRem(80) }}
                      />
                    ))}
                  </Box>
                )}

                {filterTerm && filtered.length === 0 && (
                  <Box
                    style={{ padding: config.space.S300, borderRadius: config.radii.R400 }}
                    alignItems="Center"
                    gap="200"
                  >
                    <Icon size="200" src={Icons.Info} />
                    <Text>
                      No bookmarks found for <b>{`"${filterTerm}"`}</b>
                    </Text>
                  </Box>
                )}

                {groups.length > 0 && (
                  <Box direction="Column" gap="300">
                    {filterTerm && (
                      <Box direction="Column" gap="200">
                        <Text size="H5">{`Bookmarks matching "${filterTerm}"`}</Text>
                        <Line size="300" variant="Surface" />
                      </Box>
                    )}
                    {groups.map(([roomId, items]) => (
                      <Box
                        key={roomId}
                        direction="Column"
                        style={{ paddingBottom: config.space.S500 }}
                      >
                        <BookmarkResultGroup
                          roomId={roomId}
                          roomName={items[0]?.room_name}
                          items={items}
                          onOpen={navigateRoom}
                          onRemove={remove}
                          hour24Clock={hour24Clock}
                          dateFormatString={dateFormatString}
                          highlightRegex={highlightRegex}
                        />
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
