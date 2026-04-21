import { FormEventHandler, Fragment, useCallback, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  Chip,
  config,
  color,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { JoinRule } from '$types/matrix-sdk';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroSection,
} from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { AvatarBase, ModernLayout, Time, Username, UsernameBold } from '$components/message';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { UserAvatar } from '$components/user-avatar';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getMemberAvatarMxc, getMemberDisplayName, getRoomAvatarUrl } from '$utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import colorMXID from '$utils/colorMXID';
import { stopPropagation } from '$utils/keyboard';
import { BookmarkItemContent } from '$features/bookmarks/bookmarkDomain';
import {
  useBookmarkActions,
  useBookmarkDeletedList,
  useBookmarkList,
  useBookmarkLoading,
} from '$features/bookmarks/useBookmarks';

// ---------------------------------------------------------------------------
// RemoveBookmarkDialog
// ---------------------------------------------------------------------------

type RemoveBookmarkDialogProps = {
  item: BookmarkItemContent;
  onConfirm: () => void;
  onClose: () => void;
};

function RemoveBookmarkDialog({ item, onConfirm, onClose }: RemoveBookmarkDialogProps) {
  return (
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
        {item.body_preview && (
          <Box
            style={{
              padding: config.space.S300,
              borderRadius: config.radii.R300,
              background: color.Background.Container,
            }}
          >
            <Text size="T300" priority="300" truncate>
              {item.body_preview}
            </Text>
          </Box>
        )}
        <Text priority="400">Remove this bookmark? You can always re-bookmark the message.</Text>
        <Box gap="300" justifyContent="End">
          <Button size="300" variant="Secondary" fill="Soft" radii="300" onClick={onClose}>
            <Text size="B300">Cancel</Text>
          </Button>
          <Button size="300" variant="Critical" radii="300" onClick={onConfirm}>
            <Text size="B300">Remove</Text>
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// BookmarkItemRow
// ---------------------------------------------------------------------------

type BookmarkItemRowProps = {
  item: BookmarkItemContent;
  highlight?: string;
  onJump: (roomId: string, eventId: string) => void;
  onRemove: (item: BookmarkItemContent) => void;
  hour24Clock: boolean;
  dateFormatString: string;
};

function BookmarkItemRow({
  item,
  highlight,
  onJump,
  onRemove,
  hour24Clock,
  dateFormatString,
}: BookmarkItemRowProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  // Try to resolve live room/member data; fall back to stored metadata
  const room = mx.getRoom(item.room_id) ?? undefined;
  const senderId = item.sender ?? '';

  const displayName = room
    ? (getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId)
    : (getMxIdLocalPart(senderId) ?? senderId);

  const senderAvatarMxc = room ? getMemberAvatarMxc(room, senderId) : undefined;
  const avatarUrl = senderAvatarMxc
    ? (mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined)
    : undefined;

  const usernameColor = colorMXID(senderId);

  // Highlight matching substring in body_preview
  const preview = item.body_preview ?? '';
  const highlightedPreview = useMemo(() => {
    if (!highlight || !preview) return <>{preview}</>;
    const idx = preview.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx === -1) return <>{preview}</>;
    return (
      <>
        {preview.slice(0, idx)}
        <mark style={{ background: 'none', color: 'inherit', fontWeight: 700 }}>
          {preview.slice(idx, idx + highlight.length)}
        </mark>
        {preview.slice(idx + highlight.length)}
      </>
    );
  }, [preview, highlight]);

  return (
    <SequenceCard
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
                src={avatarUrl}
                alt={displayName}
                renderFallback={() => <Icon size="200" src={Icons.User} filled />}
              />
            </Avatar>
          </AvatarBase>
        }
      >
        <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
          <Box gap="200" alignItems="Baseline">
            <Username style={{ color: usernameColor }}>
              <Text as="span" truncate>
                <UsernameBold>{displayName}</UsernameBold>
              </Text>
            </Username>
            <Time
              ts={item.event_ts}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
            />
          </Box>
          <Box shrink="No" gap="200" alignItems="Center">
            <Chip
              onClick={() => onJump(item.room_id, item.event_id)}
              variant="Secondary"
              radii="400"
            >
              <Text size="T200">Jump</Text>
            </Chip>
            <IconButton
              size="300"
              variant="Background"
              radii="300"
              onClick={() => onRemove(item)}
              aria-label="Remove bookmark"
            >
              <Icon size="100" src={Icons.Delete} />
            </IconButton>
          </Box>
        </Box>
        {preview && (
          <Text size="T300" priority="400" style={{ marginTop: config.space.S100 }}>
            {highlightedPreview}
          </Text>
        )}
      </ModernLayout>
    </SequenceCard>
  );
}

// ---------------------------------------------------------------------------
// BookmarkResultGroup
// ---------------------------------------------------------------------------

type BookmarkResultGroupProps = {
  roomId: string;
  roomName: string;
  items: BookmarkItemContent[];
  highlight?: string;
  onJump: (roomId: string, eventId: string) => void;
  onRemove: (item: BookmarkItemContent) => void;
  hour24Clock: boolean;
  dateFormatString: string;
};

function BookmarkResultGroup({
  roomId,
  roomName,
  items,
  highlight,
  onJump,
  onRemove,
  hour24Clock,
  dateFormatString,
}: BookmarkResultGroupProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const room = mx.getRoom(roomId) ?? undefined;
  const avatarUrl = room ? getRoomAvatarUrl(mx, room, 96, useAuthentication) : undefined;
  const displayRoomName = room?.name ?? roomName;

  return (
    <Box direction="Column" gap="200">
      <Header size="300">
        <Box gap="200" grow="Yes" alignItems="Center">
          <Avatar size="200" radii="300">
            <RoomAvatar
              roomId={roomId}
              src={avatarUrl}
              alt={displayRoomName}
              renderFallback={() => (
                <RoomIcon
                  size="50"
                  roomType={room?.getType()}
                  joinRule={room?.getJoinRule() ?? JoinRule.Restricted}
                  filled
                />
              )}
            />
          </Avatar>
          <Text size="H4" truncate>
            {displayRoomName}
          </Text>
        </Box>
      </Header>
      <Box direction="Column" gap="100">
        {items.map((item) => (
          <BookmarkItemRow
            key={item.bookmark_id}
            item={item}
            highlight={highlight}
            onJump={onJump}
            onRemove={onRemove}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        ))}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// RemovedBookmarkRow
// ---------------------------------------------------------------------------

type RemovedBookmarkRowProps = {
  item: BookmarkItemContent;
  onRestore: (item: BookmarkItemContent) => void;
};

function RemovedBookmarkRow({ item, onRestore }: RemovedBookmarkRowProps) {
  const mx = useMatrixClient();
  const room = mx.getRoom(item.room_id) ?? undefined;
  const roomName = room?.name ?? item.room_name ?? item.room_id;

  return (
    <SequenceCard
      style={{ padding: config.space.S300, opacity: 0.65 }}
      variant="SurfaceVariant"
      direction="Column"
    >
      <Box gap="300" justifyContent="SpaceBetween" alignItems="Center">
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
          <Text size="T300" priority="400" truncate>
            {roomName}
          </Text>
          {item.body_preview && (
            <Text size="T200" priority="300" truncate>
              {item.body_preview}
            </Text>
          )}
        </Box>
        <Chip onClick={() => onRestore(item)} variant="Secondary" radii="400">
          <Text size="T200">Restore</Text>
        </Chip>
      </Box>
    </SequenceCard>
  );
}

// ---------------------------------------------------------------------------
// BookmarkFilterInput
// ---------------------------------------------------------------------------

type BookmarkFilterInputProps = {
  inputRef: React.RefObject<HTMLInputElement>;
  active?: boolean;
  loading?: boolean;
  onFilter: (term: string) => void;
  onReset: () => void;
};

function BookmarkFilterInput({
  inputRef,
  active,
  loading,
  onFilter,
  onReset,
}: BookmarkFilterInputProps) {
  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const { filterInput } = evt.target as HTMLFormElement & {
      filterInput: HTMLInputElement;
    };
    const term = filterInput.value.trim();
    if (term) onFilter(term);
  };

  return (
    <Box as="form" direction="Column" gap="100" onSubmit={handleSubmit}>
      <span data-spacing-node />
      <Text size="L400">Filter</Text>
      <Input
        ref={inputRef}
        name="filterInput"
        variant="Background"
        placeholder="Filter bookmarks…"
        style={{ paddingRight: config.space.S300 }}
        after={
          loading ? (
            <Spinner variant="Secondary" size="200" />
          ) : (
            <Box gap="200" alignItems="Center">
              {active && (
                <Chip
                  type="button"
                  onClick={onReset}
                  variant="Secondary"
                  radii="Pill"
                  aria-label="Clear filter"
                >
                  <Icon size="50" src={Icons.Cross} />
                  <Text size="T200">Clear</Text>
                </Chip>
              )}
              <Chip type="submit" variant="Primary" radii="Pill">
                <Text size="T200">Filter</Text>
              </Chip>
            </Box>
          )
        }
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// BookmarksList (main export)
// ---------------------------------------------------------------------------

export function BookmarksList() {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const { navigateRoom } = useRoomNavigate();

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const bookmarks = useBookmarkList();
  const deletedBookmarks = useBookmarkDeletedList();
  const loading = useBookmarkLoading();
  const { remove, restore } = useBookmarkActions();

  const [filterTerm, setFilterTerm] = useState<string | undefined>();
  const [removingItem, setRemovingItem] = useState<BookmarkItemContent | undefined>();

  // Filter and group bookmarks
  const filteredBookmarks = useMemo(() => {
    if (!filterTerm) return bookmarks;
    const lower = filterTerm.toLowerCase();
    return bookmarks.filter(
      (b) =>
        b.body_preview?.toLowerCase().includes(lower) ||
        b.room_name?.toLowerCase().includes(lower) ||
        (b.sender && getMxIdLocalPart(b.sender)?.toLowerCase().includes(lower))
    );
  }, [bookmarks, filterTerm]);

  // Group by room_id, preserving order
  const groupedByRoom = useMemo(() => {
    const map = new Map<
      string,
      { roomId: string; roomName: string; items: BookmarkItemContent[] }
    >();
    filteredBookmarks.forEach((item) => {
      let group = map.get(item.room_id);
      if (!group) {
        const room = mx.getRoom(item.room_id);
        group = {
          roomId: item.room_id,
          roomName: room?.name ?? item.room_name ?? item.room_id,
          items: [],
        };
        map.set(item.room_id, group);
      }
      group.items.push(item);
    });
    return Array.from(map.values());
  }, [filteredBookmarks, mx]);

  const handleJump = useCallback(
    (roomId: string, eventId: string) => {
      navigateRoom(roomId, eventId);
    },
    [navigateRoom]
  );

  const handleRemoveConfirm = useCallback(async () => {
    if (!removingItem) return;
    await remove(removingItem.bookmark_id);
    setRemovingItem(undefined);
  }, [removingItem, remove]);

  const handleRestore = useCallback(
    async (item: BookmarkItemContent) => {
      await restore(item);
    },
    [restore]
  );

  const handleFilter = useCallback((term: string) => {
    setFilterTerm(term);
  }, []);

  const handleReset = useCallback(() => {
    setFilterTerm(undefined);
    if (filterInputRef.current) {
      filterInputRef.current.value = '';
    }
  }, []);

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
        <Scroll ref={scrollRef} hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <BookmarkFilterInput
                inputRef={filterInputRef}
                active={!!filterTerm}
                loading={loading}
                onFilter={handleFilter}
                onReset={handleReset}
              />

              {loading && bookmarks.length === 0 && (
                <Box justifyContent="Center" style={{ marginTop: config.space.S500 }}>
                  <Spinner variant="Secondary" size="400" />
                </Box>
              )}

              {!loading && bookmarks.length === 0 && (
                <PageHeroSection>
                  <PageHero
                    icon={<Icon size="600" src={Icons.Bookmark} />}
                    title="No Bookmarks Yet"
                    subTitle="Bookmark messages to find them again easily. Right-click a message and choose Bookmark."
                  />
                </PageHeroSection>
              )}

              {!loading && bookmarks.length > 0 && filteredBookmarks.length === 0 && (
                <Box
                  direction="Column"
                  gap="200"
                  alignItems="Center"
                  style={{ marginTop: config.space.S500 }}
                >
                  <Icon size="400" src={Icons.Search} />
                  <Text size="T400" priority="300" align="Center">
                    No bookmarks match your filter.
                  </Text>
                </Box>
              )}

              {groupedByRoom.length > 0 && (
                <Box direction="Column" gap="500" style={{ marginTop: config.space.S300 }}>
                  {groupedByRoom.map((group, i) => (
                    <Fragment key={group.roomId}>
                      {i > 0 && <Line variant="Background" size="300" />}
                      <BookmarkResultGroup
                        roomId={group.roomId}
                        roomName={group.roomName}
                        items={group.items}
                        highlight={filterTerm}
                        onJump={handleJump}
                        onRemove={setRemovingItem}
                        hour24Clock={hour24Clock}
                        dateFormatString={dateFormatString}
                      />
                    </Fragment>
                  ))}
                </Box>
              )}

              {deletedBookmarks.length > 0 && !filterTerm && (
                <Box direction="Column" gap="200" style={{ marginTop: config.space.S400 }}>
                  <Line variant="Background" size="300" />
                  <Header size="300">
                    <Text size="H4" priority="300">
                      Recently Removed
                    </Text>
                  </Header>
                  <Box direction="Column" gap="100">
                    {deletedBookmarks.map((item) => (
                      <RemovedBookmarkRow
                        key={item.bookmark_id}
                        item={item}
                        onRestore={handleRestore}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>

      {removingItem && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setRemovingItem(undefined),
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <RemoveBookmarkDialog
                item={removingItem}
                onConfirm={handleRemoveConfirm}
                onClose={() => setRemovingItem(undefined)}
              />
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
    </Page>
  );
}
