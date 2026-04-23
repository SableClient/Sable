import type { MouseEventHandler, ReactNode } from 'react';
import { forwardRef, useCallback, useMemo, useRef } from 'react';
import type { MatrixEvent, Room, RoomPinnedEventsEventContent } from '$types/matrix-sdk';
import type { IImageContent } from '$types/matrix/common';
import {
  Avatar,
  Box,
  Chip,
  color,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Menu,
  Scroll,
  Spinner,
  Text,
  toRem,
} from 'folds';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import type { HTMLReactParserOptions } from 'html-react-parser';
import { useAtomValue } from 'jotai';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createLogger } from '$utils/debug';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { SequenceCard } from '$components/sequence-card';
import { useRoomEvent } from '$hooks/useRoomEvent';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import {
  AvatarBase,
  DefaultPlaceholder,
  ImageContent,
  MessageNotDecryptedContent,
  MessageUnsupportedContent,
  ModernLayout,
  MSticker,
  RedactedContent,
  Reply,
  Time,
  Username,
  UsernameBold,
} from '$components/message';
import { UserAvatar } from '$components/user-avatar';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  getEditedEvent,
  getMemberAvatarMxc,
  getMemberDisplayName,
  getStateEvent,
} from '$utils/room';
import type { GetContentCallback } from '$types/matrix/room';
import type { StateEvents } from '$types/matrix-sdk';

import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import type { RenderMatrixEvent } from '$hooks/useMatrixEventRenderer';
import { useMatrixEventRenderer } from '$hooks/useMatrixEventRenderer';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { Image } from '$components/media';
import { ImageViewer } from '$components/image-viewer';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { VirtualTile } from '$components/virtualizer';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { ContainerColor } from '$styles/ContainerColor.css';
import { usePowerLevelTags } from '$hooks/usePowerLevelTags';
import { useTheme } from '$hooks/useTheme';
import { PowerIcon } from '$components/power';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import type { GetMemberPowerTag } from '$hooks/useMemberPowerTag';
import {
  getPowerTagIconSrc,
  useAccessiblePowerTagColors,
  useGetMemberPowerTag,
} from '$hooks/useMemberPowerTag';
import { useRoomCreatorsTag } from '$hooks/useRoomCreatorsTag';
import { nicknamesAtom } from '$state/nicknames';

import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { EncryptedContent } from '$features/room/message';
import type { PinReadMarker } from '$features/room/RoomViewHeader';
import * as css from './RoomPinMenu.css';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { EventType } from '$types/matrix-sdk';

const log = createLogger('RoomPinMenu');

type PinnedMessageProps = {
  room: Room;
  eventId: string;
  renderContent: RenderMatrixEvent<[MatrixEvent, string, GetContentCallback]>;
  onOpen: (roomId: string, eventId: string) => void;
  canPinEvent: boolean;
  getMemberPowerTag: GetMemberPowerTag;
  accessibleTagColors: Map<string, string>;
  hour24Clock: boolean;
  dateFormatString: string;
  isNew: boolean;
};

function PinnedMessageActiveContent(
  props: PinnedMessageProps & {
    pinnedEvent: MatrixEvent;
    renderOptions: () => ReactNode;
    handleOpenClick: MouseEventHandler;
  }
) {
  const {
    pinnedEvent,
    room,
    renderContent,
    hour24Clock,
    dateFormatString,
    getMemberPowerTag,
    renderOptions,
    handleOpenClick,
  } = props;

  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);

  const sender = pinnedEvent.getSender()!;
  const { color: usernameColor, font: usernameFont } = useSableCosmetics(sender, room);

  const displayName =
    getMemberDisplayName(room, sender, nicknames) ?? getMxIdLocalPart(sender) ?? sender;
  const senderAvatarMxc = getMemberAvatarMxc(room, sender);
  const getContent = (() => pinnedEvent.getContent()) as GetContentCallback;
  const content = pinnedEvent.getContent();

  const memberPowerTag = getMemberPowerTag(sender);
  const tagIconSrc = memberPowerTag?.icon
    ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
    : undefined;

  return (
    <ModernLayout
      before={
        <AvatarBase>
          <Avatar size="300">
            <UserAvatar
              userId={sender}
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
        <Box gap="200" alignItems="Baseline">
          <Box alignItems="Center" gap="200">
            <Username style={{ color: usernameColor, font: usernameFont }}>
              <Text as="span" truncate>
                <UsernameBold>{displayName}</UsernameBold>
              </Text>
            </Username>
            {tagIconSrc && <PowerIcon size="100" iconSrc={tagIconSrc} />}
          </Box>
          <Time
            ts={pinnedEvent.getTs()}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        </Box>
        {renderOptions()}
      </Box>
      {pinnedEvent.replyEventId && (
        <Reply
          room={room}
          replyEventId={pinnedEvent.replyEventId}
          threadRootId={pinnedEvent.threadRootId}
          mentions={content['m.mentions']}
          onClick={handleOpenClick}
        />
      )}
      {renderContent(pinnedEvent.getType(), false, pinnedEvent, displayName, getContent)}
    </ModernLayout>
  );
}

function PinnedMessage(props: PinnedMessageProps) {
  const { room, eventId, onOpen, canPinEvent } = props;
  const pinnedEvent = useRoomEvent(room, eventId);
  const mx = useMatrixClient();

  const [unpinState, unpin] = useAsyncCallback(
    useCallback(() => {
      const pinEvent = getStateEvent(room, EventType.RoomPinnedEvents);
      const content = pinEvent?.getContent<RoomPinnedEventsEventContent>() ?? { pinned: [] };
      const newContent: RoomPinnedEventsEventContent = {
        pinned: content.pinned.filter((id: string) => id !== eventId),
      };

      return mx.sendStateEvent(
        room.roomId,
        EventType.RoomPinnedEvents as keyof StateEvents,
        newContent
      );
    }, [room, eventId, mx])
  );

  const handleOpenClick: MouseEventHandler = useCallback(
    (evt) => {
      evt.stopPropagation();
      onOpen(room.roomId, eventId);
    },
    [onOpen, room.roomId, eventId]
  );

  const handleUnpinClick: MouseEventHandler = useCallback(
    (evt) => {
      evt.stopPropagation();
      unpin().catch((err) => {
        log.warn('Failed to unpin room event:', err);
      });
    },
    [unpin]
  );

  const renderOptions = () => (
    <Box shrink="No" gap="200" alignItems="Center">
      <Chip data-event-id={eventId} onClick={handleOpenClick} radii="Pill">
        <Text size="T200">Jump</Text>
      </Chip>
      {canPinEvent && (
        <IconButton
          data-event-id={eventId}
          size="300"
          radii="Pill"
          onClick={unpinState.status === AsyncStatus.Loading ? undefined : handleUnpinClick}
          aria-disabled={unpinState.status === AsyncStatus.Loading}
        >
          {unpinState.status === AsyncStatus.Loading ? (
            <Spinner size="100" />
          ) : (
            <Icon src={Icons.Cross} size="100" />
          )}
        </IconButton>
      )}
    </Box>
  );

  if (pinnedEvent === undefined) return <DefaultPlaceholder variant="Secondary" />;

  if (pinnedEvent === null) {
    return (
      <Box gap="300" justifyContent="SpaceBetween" alignItems="Center">
        <Box>
          <Text style={{ color: color.Critical.Main }}>Failed to load message!</Text>
        </Box>
        {renderOptions()}
      </Box>
    );
  }

  return (
    <PinnedMessageActiveContent
      {...props}
      pinnedEvent={pinnedEvent}
      renderOptions={renderOptions}
      handleOpenClick={handleOpenClick}
    />
  );
}

type RoomPinMenuProps = {
  room: Room;
  requestClose: () => void;
  currentHash: string;
};

export const RoomPinMenu = forwardRef<HTMLDivElement, RoomPinMenuProps>(
  ({ room, requestClose, currentHash }, ref) => {
    const mx = useMatrixClient();
    const userId = mx.getUserId()!;
    const nicknames = useAtomValue(nicknamesAtom);
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canPinEvent = permissions.stateEvent(EventType.RoomPinnedEvents, userId);

    const creatorsTag = useRoomCreatorsTag();
    const powerLevelTags = usePowerLevelTags(room, powerLevels);
    const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

    const theme = useTheme();
    const accessibleTagColors = useAccessiblePowerTagColors(
      theme.kind,
      creatorsTag,
      powerLevelTags
    );

    const pinnedEvents = useRoomPinnedEvents(room);
    const sortedPinnedEvent = useMemo(() => Array.from(pinnedEvents).reverse(), [pinnedEvents]);
    const useAuthentication = useMediaAuthentication();
    const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
    const [urlPreview] = useSetting(settingsAtom, 'urlPreview');

    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

    const { navigateRoom } = useRoomNavigate();
    const scrollRef = useRef<HTMLDivElement>(null);

    const pinMarker = useMemo(
      () =>
        room.getAccountData(CustomAccountDataEvent.SablePinStatus)?.getContent() as PinReadMarker,
      [room]
    );

    const lastSeenIndex = useMemo(() => {
      if (!pinMarker?.last_seen_id) return -1;
      return pinnedEvents.indexOf(pinMarker.last_seen_id);
    }, [pinnedEvents, pinMarker]);

    const virtualizer = useVirtualizer({
      count: sortedPinnedEvent.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => 75,
      overscan: 4,
    });

    const mentionClickHandler = useMentionClickHandler(room.roomId);
    const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
    const spoilerClickHandler = useSpoilerClickHandler();

    const linkifyOpts = useMemo<LinkifyOpts>(
      () => ({
        ...LINKIFY_OPTS,
        render: factoryRenderLinkifyWithMention(
          settingsLinkBaseUrl,
          (href) =>
            renderMatrixMention(
              mx,
              room.roomId,
              href,
              makeMentionCustomProps(mentionClickHandler),
              nicknames
            ),
          mentionClickHandler
        ),
      }),
      [mx, room, mentionClickHandler, nicknames, settingsLinkBaseUrl]
    );
    const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
      () =>
        getReactCustomHtmlParser(mx, room.roomId, {
          settingsLinkBaseUrl,
          linkifyOpts,
          useAuthentication,
          handleSpoilerClick: spoilerClickHandler,
          handleMentionClick: mentionClickHandler,
          nicknames,
        }),
      [
        mx,
        room,
        linkifyOpts,
        mentionClickHandler,
        spoilerClickHandler,
        useAuthentication,
        nicknames,
        settingsLinkBaseUrl,
      ]
    );

    const renderMatrixEvent = useMatrixEventRenderer<[MatrixEvent, string, GetContentCallback]>(
      {
        [EventType.RoomMessage]: (event, displayName, getContent) => {
          if (event.isRedacted()) {
            const unsigned = event.getUnsigned();
            const redactionContent = unsigned.redacted_because?.content as
              | { reason?: string }
              | undefined;
            return <RedactedContent reason={redactionContent?.reason} />;
          }

          return (
            <RenderMessageContent
              displayName={displayName}
              msgType={event.getContent().msgtype ?? ''}
              ts={event.getTs()}
              getContent={getContent}
              edited={!!event.replacingEvent()}
              mediaAutoLoad={mediaAutoLoad}
              urlPreview={urlPreview}
              htmlReactParserOptions={htmlReactParserOptions}
              linkifyOpts={linkifyOpts}
              outlineAttachment
            />
          );
        },
        [EventType.RoomMessageEncrypted]: (event, displayName) => {
          const eventId = event.getId()!;
          const evtTimeline = room.getTimelineForEvent(eventId);

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
              {() => {
                const eventType = mEvent.getType();
                const stickerEventType: string = EventType.Sticker;
                const roomMessageEventType: string = EventType.RoomMessage;
                const encryptedMessageEventType: string = EventType.RoomMessageEncrypted;
                if (mEvent.isRedacted()) return <RedactedContent />;
                if (eventType === stickerEventType)
                  return (
                    <MSticker
                      content={mEvent.getContent()}
                      renderImageContent={(props) => (
                        <ImageContent
                          {...props}
                          autoPlay={mediaAutoLoad}
                          renderImage={(p) => <Image {...p} loading="lazy" />}
                          renderViewer={(p) => <ImageViewer {...p} />}
                        />
                      )}
                    />
                  );
                if (eventType === roomMessageEventType) {
                  const editedEvent = getEditedEvent(eventId, mEvent, evtTimeline.getTimelineSet());
                  const getContent = (() => {
                    const eventContent = mEvent.getContent();
                    const editContent = editedEvent?.getContent();
                    return (editContent?.['m.new_content'] ?? eventContent) as Record<
                      string,
                      unknown
                    >;
                  }) as GetContentCallback;

                  return (
                    <RenderMessageContent
                      displayName={displayName}
                      msgType={mEvent.getContent().msgtype ?? ''}
                      ts={mEvent.getTs()}
                      edited={!!editedEvent || !!mEvent.replacingEvent()}
                      getContent={getContent}
                      mediaAutoLoad={mediaAutoLoad}
                      urlPreview={urlPreview}
                      htmlReactParserOptions={htmlReactParserOptions}
                      linkifyOpts={linkifyOpts}
                    />
                  );
                }
                if (eventType === encryptedMessageEventType)
                  return (
                    <Text>
                      <MessageNotDecryptedContent />
                    </Text>
                  );
                return (
                  <Text>
                    <MessageUnsupportedContent />
                  </Text>
                );
              }}
            </EncryptedContent>
          );
        },
        [EventType.Sticker]: (event, _displayName, getContent) => {
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
              renderImageContent={(props) => (
                <ImageContent
                  {...props}
                  autoPlay={mediaAutoLoad}
                  renderImage={(p) => <Image {...p} loading="lazy" />}
                  renderViewer={(p) => <ImageViewer {...p} />}
                />
              )}
            />
          );
        },
      },
      undefined,
      (event) => {
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
    );

    const handleOpen = (roomId: string, eventId: string) => {
      navigateRoom(roomId, eventId);
      requestClose();
    };

    return (
      <Menu ref={ref} className={css.PinMenu}>
        <Box grow="Yes" direction="Column">
          <Header className={css.PinMenuHeader} size="500">
            <Box grow="Yes">
              <Text size="H5">Pinned Messages</Text>
            </Box>
            <Box shrink="No">
              <IconButton size="300" onClick={requestClose} radii="300">
                <Icon src={Icons.Cross} size="400" />
              </IconButton>
            </Box>
          </Header>
          <Box grow="Yes">
            <Scroll ref={scrollRef} size="300" hideTrack visibility="Hover">
              <Box className={css.PinMenuContent} direction="Column" gap="100">
                {sortedPinnedEvent.length > 0 ? (
                  <div
                    style={{
                      position: 'relative',
                      height: virtualizer.getTotalSize(),
                    }}
                  >
                    {virtualizer.getVirtualItems().map((vItem) => {
                      const eventId = sortedPinnedEvent[vItem.index];
                      if (!eventId) return null;

                      const originalIndex = pinnedEvents.indexOf(eventId);
                      let isNew = false;
                      if (pinMarker?.hash !== currentHash) {
                        if (lastSeenIndex !== -1) {
                          isNew = originalIndex > lastSeenIndex;
                        } else {
                          const oldCount = pinMarker?.count ?? 0;
                          isNew = originalIndex >= oldCount - 1;
                        }
                      }

                      return (
                        <VirtualTile
                          virtualItem={vItem}
                          style={{ paddingBottom: config.space.S200 }}
                          ref={virtualizer.measureElement}
                          key={vItem.index}
                        >
                          <SequenceCard
                            style={{
                              padding: config.space.S400,
                              borderRadius: config.radii.R300,
                              border: isNew
                                ? `${config.borderWidth.B700} solid ${color.Secondary.ContainerActive}`
                                : undefined,
                            }}
                            variant="Background"
                            direction="Column"
                          >
                            <PinnedMessage
                              room={room}
                              eventId={eventId}
                              renderContent={renderMatrixEvent}
                              onOpen={handleOpen}
                              canPinEvent={canPinEvent}
                              getMemberPowerTag={getMemberPowerTag}
                              accessibleTagColors={accessibleTagColors}
                              hour24Clock={hour24Clock}
                              isNew={isNew}
                              dateFormatString={dateFormatString}
                            />
                          </SequenceCard>
                        </VirtualTile>
                      );
                    })}
                  </div>
                ) : (
                  <Box
                    className={ContainerColor({ variant: 'SurfaceVariant' })}
                    style={{
                      marginBottom: config.space.S200,
                      padding: `${config.space.S700} ${config.space.S400} ${toRem(60)}`,
                      borderRadius: config.radii.R300,
                    }}
                    grow="Yes"
                    direction="Column"
                    gap="400"
                    justifyContent="Center"
                    alignItems="Center"
                  >
                    <Icon src={Icons.Pin} size="600" />
                    <Box
                      style={{ maxWidth: toRem(300) }}
                      direction="Column"
                      gap="200"
                      alignItems="Center"
                    >
                      <Text size="H4" align="Center">
                        No Pinned Messages
                      </Text>
                      <Text size="T400" align="Center">
                        Users with sufficient power level can pin messages from the context menu.
                      </Text>
                    </Box>
                  </Box>
                )}
              </Box>
            </Scroll>
          </Box>
        </Box>
      </Menu>
    );
  }
);

RoomPinMenu.displayName = 'RoomPinMenu';
