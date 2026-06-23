import type {
  ChangeEventHandler,
  ComponentProps,
  FormEventHandler,
  MouseEventHandler,
} from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { ClientEvent, EventType, IEvent, JoinRule, M_POLL_START } from 'matrix-js-sdk';
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
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
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
import type { BookmarkIndexContent, BookmarkItemContent } from '$types/matrix-sdk-events';
import { SequenceCard } from '../../../components/sequence-card';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import {
  AvatarBase,
  ImageContent,
  MessageNotDecryptedContent,
  MessageUnsupportedContent,
  ModernLayout,
  MSticker,
  RedactedContent,
  RenderImageContentProps,
  Time,
  Username,
  UsernameBold,
} from '../../../components/message';
import { UserAvatar } from '../../../components/user-avatar';
import { RoomAvatar, RoomIcon } from '../../../components/room-avatar';
import {
  getEditedEvent,
  getMemberAvatarMxc,
  getMemberDisplayName,
  getRoomAvatarUrl,
} from '../../../utils/room';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { mDirectAtom } from '../../../state/mDirectList';
import { stopPropagation } from '../../../utils/keyboard';
import { highlightText, makeHighlightRegex } from '../../../plugins/react-custom-html-parser';
import colorMXID from '$utils/colorMXID';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { GetContentCallback } from '$types/matrix/room';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { useRoomEvent } from '$hooks/useRoomEvent';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Opts } from 'linkifyjs';
import { ImageViewer } from '$components/image-viewer';
import { Image } from '$components/media';
import { EncryptedContent } from '$features/room/message';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { IImageContent } from '$types/matrix/common';
import { RenderMatrixEvent, useMatrixEventRenderer } from '$hooks/useMatrixEventRenderer';
import { MATRIX_SABLE_UNSTABLE_BOOKMARKS_INDEX_EVENT } from '$unstable/prefixes';
import { useDebounce } from '$hooks/useDebounce';

type RemoveBookmarkDialogProps = {
  open: boolean;
  event?: MatrixEvent;
  bodyPreview?: string;
  sender?: string;
  displayName?: string;
  senderAvatarMxc?: string;
  renderMatrixEvent: RenderMatrixEvent<[MatrixEvent, string, GetContentCallback]>;
  onConfirm: () => void;
  onClose: () => void;
};
function RemoveBookmarkDialog({
  open,
  event,
  bodyPreview,
  sender,
  displayName,
  senderAvatarMxc,
  renderMatrixEvent,
  onConfirm,
  onClose,
}: RemoveBookmarkDialogProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const getContent = (() => event?.getContent()) as GetContentCallback;

  return (
    <Overlay open={open} backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
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
              {(bodyPreview || sender) && (
                <Box
                  style={{
                    padding: config.space.S200,
                    borderRadius: config.radii.R300,
                  }}
                  direction="Column"
                  gap="200"
                >
                  {sender && (
                    <Box gap="200" alignItems="Center">
                      <Avatar size="200">
                        <UserAvatar
                          userId={sender}
                          src={
                            senderAvatarMxc
                              ? (mxcUrlToHttp(
                                  mx,
                                  senderAvatarMxc,
                                  useAuthentication,
                                  32,
                                  32,
                                  'crop'
                                ) ?? undefined)
                              : undefined
                          }
                          alt={displayName ?? sender}
                          renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                        />
                      </Avatar>
                      <Text size="T300" truncate>
                        <b>{displayName ?? sender}</b>
                      </Text>
                    </Box>
                  )}
                  {event
                    ? renderMatrixEvent(
                        event.getType(),
                        false,
                        event,
                        displayName ?? sender ?? '',
                        getContent
                      )
                    : bodyPreview && (
                        <Text size="T300" priority="300">
                          {bodyPreview}
                        </Text>
                      )}
                </Box>
              )}
              <Button variant="Critical" onClick={onConfirm}>
                <Text size="B400">Remove</Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

type BookmarkItemRowProps = {
  item: BookmarkItemContent;
  room?: Room;
  displayName: string;
  senderAvatarMxc?: string;
  usernameColor?: string;
  hour24Clock: boolean;
  dateFormatString: string;
  onOpen: MouseEventHandler;
  onRemove: (bookmarkId: string) => void;
  highlightRegex?: RegExp;
};

type bookmarkRendererContext = {
  mx: ReturnType<typeof useMatrixClient>;
  room?: Room;
  mediaAutoLoad: boolean;
  urlPreview: boolean;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
};

function BookmarkLazyImage(props: ComponentProps<typeof Image>) {
  return <Image {...props} loading="lazy" />;
}

function renderBookmarkStickerImageContent(
  mediaAutoLoad: boolean | undefined,
  props: RenderImageContentProps
) {
  return (
    <ImageContent
      {...props}
      autoPlay={mediaAutoLoad}
      renderImage={BookmarkLazyImage}
      renderViewer={(p) => <ImageViewer {...p} />}
    />
  );
}

function renderBookmarkEncryptedDecrypted(
  ctx: bookmarkRendererContext,
  event: MatrixEvent,
  displayName: string,
  mEvent: MatrixEvent,
  evtTimeline: NonNullable<ReturnType<Room['getTimelineForEvent']>>
) {
  const eventId = event.getId()!;
  const eventType = mEvent.getType();
  const stickerEventType: string = EventType.Sticker;
  const roomMessageEventType: string = EventType.RoomMessage;
  const encryptedMessageEventType: string = EventType.RoomMessageEncrypted;

  if (mEvent.isRedacted()) return <RedactedContent />;
  if (eventType === stickerEventType) {
    return (
      <MSticker
        content={mEvent.getContent()}
        renderImageContent={renderBookmarkStickerImageContent.bind(null, ctx.mediaAutoLoad)}
      />
    );
  }
  if (eventType === roomMessageEventType) {
    const editedEvent = getEditedEvent(eventId, mEvent, evtTimeline.getTimelineSet());
    const getContent = (() => {
      const eventContent = mEvent.getContent();
      const editContent = editedEvent?.getContent();
      return (editContent?.['m.new_content'] ?? eventContent) as Record<string, unknown>;
    }) as GetContentCallback;

    return (
      <RenderMessageContent
        displayName={displayName}
        msgType={mEvent.getContent().msgtype ?? ''}
        ts={mEvent.getTs()}
        edited={!!editedEvent || !!mEvent.replacingEvent()}
        getContent={getContent}
        mediaAutoLoad={ctx.mediaAutoLoad}
        urlPreview={ctx.urlPreview}
        htmlReactParserOptions={ctx.htmlReactParserOptions}
        linkifyOpts={ctx.linkifyOpts}
        mx={ctx.mx}
        room={ctx.room}
        mEvent={event}
      />
    );
  }
  if (eventType === encryptedMessageEventType) {
    return (
      <Text>
        <MessageNotDecryptedContent />
      </Text>
    );
  }
  return (
    <Text>
      <MessageUnsupportedContent />
    </Text>
  );
}

function renderBookmarkEncrypted(
  ctx: bookmarkRendererContext,
  event: MatrixEvent,
  displayName: string
) {
  const eventId = event.getId()!;
  const evtTimeline = ctx.room?.getTimelineForEvent(eventId);
  const mEvent = evtTimeline?.getEvents().find((e: MatrixEvent) => e.getId() === eventId);

  if (!mEvent || !evtTimeline) {
    return (
      <Box grow="Yes" direction="Column">
        <Text size="T400" priority="300">
          <code className={customHtmlCss.Code}>{event.getType()}</code>
          {' event'}
        </Text>
      </Box>
    );
  }

  return (
    <EncryptedContent mEvent={mEvent}>
      {renderBookmarkEncryptedDecrypted.bind(null, ctx, event, displayName, mEvent, evtTimeline)}
    </EncryptedContent>
  );
}

function renderBookmarkRoomMessage(
  ctx: bookmarkRendererContext,
  event: MatrixEvent,
  displayName: string,
  getContent: GetContentCallback
) {
  if (event.isRedacted()) {
    const unsigned = event.getUnsigned();
    const redactionContent = unsigned.redacted_because?.content as { reason?: string } | undefined;
    return <RedactedContent reason={redactionContent?.reason} />;
  }

  return (
    <RenderMessageContent
      displayName={displayName}
      msgType={event.getContent().msgtype ?? ''}
      ts={event.getTs()}
      getContent={getContent}
      edited={!!event.replacingEvent()}
      mediaAutoLoad={ctx.mediaAutoLoad}
      urlPreview={ctx.urlPreview}
      htmlReactParserOptions={ctx.htmlReactParserOptions}
      linkifyOpts={ctx.linkifyOpts}
      outlineAttachment
      mEvent={event}
      mx={ctx.mx}
      room={ctx.room}
    />
  );
}

function renderBookmarkSticker(
  ctx: bookmarkRendererContext,
  event: MatrixEvent,
  _displayName: string,
  getContent: GetContentCallback
) {
  if (event.isRedacted()) {
    const unsigned = event.getUnsigned();
    const redactionContent = unsigned.redacted_because?.content as
      | Record<string, unknown>
      | undefined;

    return <RedactedContent reason={redactionContent?.reason as string | undefined} />;
  }
  return (
    <MSticker
      content={getContent() as IImageContent}
      renderImageContent={renderBookmarkStickerImageContent.bind(null, ctx.mediaAutoLoad)}
    />
  );
}

function renderBookmarkFallback(_ctx: bookmarkRendererContext, event: MatrixEvent) {
  if (event.isRedacted()) {
    const unsigned = event.getUnsigned();
    const redactionContent = unsigned.redacted_because?.content as
      | Record<string, unknown>
      | undefined;
    return <RedactedContent reason={redactionContent?.reason as string | undefined} />;
  }
  return (
    <Box grow="Yes" direction="Column">
      <Text size="T400" priority="300">
        <code className={customHtmlCss.Code}>{event.getType()}</code>
        {' event'}
      </Text>
    </Box>
  );
}

function BookmarkItemRow({
  item,
  room,
  displayName,
  senderAvatarMxc,
  usernameColor,
  hour24Clock,
  dateFormatString,
  onOpen,
  onRemove,
  highlightRegex,
}: BookmarkItemRowProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const event = room && useRoomEvent(room, item.event_id); // TODO: only fetch when in view (virtualizer?)

  const getContent = (() => event?.getContent()) as GetContentCallback;

  const handleConfirmRemove = () => {
    setConfirmOpen(false);
    onRemove(item.bookmark_id);
  };

  const rendererContext = useMemo<bookmarkRendererContext>(
    () => ({
      mx,
      room,
      mediaAutoLoad,
      urlPreview,
      htmlReactParserOptions: {},
      linkifyOpts: {},
    }),
    [mx, room, mediaAutoLoad, urlPreview]
  );

  // TODO: abstract this (code from pin menu) and reuse in a lot of places
  const matrixEventHandlers = useMemo(
    () => ({
      [EventType.RoomMessage]: renderBookmarkRoomMessage.bind(null, rendererContext),
      [EventType.RoomMessageEncrypted]: renderBookmarkEncrypted.bind(null, rendererContext),
      [EventType.Sticker]: renderBookmarkSticker.bind(null, rendererContext),
      [M_POLL_START.name]: renderBookmarkRoomMessage.bind(null, rendererContext),
    }),
    [rendererContext]
  );

  const renderMatrixEvent = useMatrixEventRenderer<[MatrixEvent, string, GetContentCallback]>(
    matrixEventHandlers,
    undefined,
    renderBookmarkFallback.bind(null, rendererContext)
  );

  return (
    <>
      <RemoveBookmarkDialog
        open={confirmOpen}
        bodyPreview={item.body_preview}
        sender={item.sender}
        event={event ?? undefined}
        displayName={displayName}
        senderAvatarMxc={senderAvatarMxc}
        onConfirm={handleConfirmRemove}
        renderMatrixEvent={renderMatrixEvent}
        onClose={() => setConfirmOpen(false)}
      />
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
                  userId={item.sender ?? ''}
                  src={
                    senderAvatarMxc
                      ? (mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ??
                        undefined)
                      : undefined
                  }
                  alt={displayName}
                  renderFallback={() => <Icon size="200" src={Icons.User} filled />}
                />
              </Avatar>
            </AvatarBase>
          }
        >
          <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
            <Box gap="200" alignItems="Baseline" wrap="Wrap">
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
                <Chip
                  data-event-id={item.event_id}
                  onClick={onOpen}
                  variant="Secondary"
                  radii="400"
                >
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
          </Box>

          <Box grow="Yes" direction="Column">
            {event ? (
              renderMatrixEvent(event.getType(), false, event, displayName, getContent)
            ) : (
              <Text size="T400" style={{ whiteSpace: 'pre-wrap' }}>
                {item.body_preview
                  ? highlightRegex
                    ? highlightText(highlightRegex, [item.body_preview])
                    : item.body_preview
                  : 'This bookmark has no preview'}
              </Text>
            )}
          </Box>
        </ModernLayout>
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
  legacyUsernameColor?: boolean;
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
  legacyUsernameColor,
  highlightRegex,
}: BookmarkResultGroupProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const room = mx.getRoom(roomId);

  const handleOpenClick: MouseEventHandler = (evt) => {
    const eventId = evt.currentTarget.getAttribute('data-event-id');
    if (!eventId) return;
    onOpen(roomId, eventId);
  };

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
          const displayName = room
            ? (getMemberDisplayName(room, item.sender ?? '') ??
              getMxIdLocalPart(item.sender ?? '') ??
              item.sender ??
              'Unknown')
            : (getMxIdLocalPart(item.sender ?? '') ?? item.sender ?? 'Unknown');
          const senderAvatarMxc =
            room && item.sender ? getMemberAvatarMxc(room, item.sender) : undefined;

          const usernameColor =
            legacyUsernameColor && item.sender ? colorMXID(item.sender) : undefined;

          return (
            <BookmarkItemRow
              key={item.bookmark_id}
              item={item}
              room={room ?? undefined}
              displayName={displayName}
              senderAvatarMxc={senderAvatarMxc}
              usernameColor={usernameColor}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
              onOpen={handleOpenClick}
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
  searchInputRef: React.RefObject<HTMLInputElement>;
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
  const mDirects = useAtomValue(mDirectAtom);

  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
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
    useCallback(
      (evt) => {
        if (evt.target.value) setFilterTerm(evt.target.value);
        else setFilterTerm(undefined);
      },
      [filterTerm]
    ),
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
                          legacyUsernameColor={legacyUsernameColor || mDirects.has(roomId)}
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
