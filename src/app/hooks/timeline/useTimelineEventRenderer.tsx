import { MouseEventHandler, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import {
  MatrixClient,
  MatrixEvent,
  Room,
  PushProcessor,
  EventTimelineSet,
  IContent,
} from '$types/matrix-sdk';
import { SessionMembershipData } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { Box, Chip, Avatar, Text, Icons, config, toRem, Icon } from 'folds';
import { MessageLayout } from '$state/settings';
import { nicknamesAtom } from '$state/nicknames';
import { useGetMemberPowerTag } from '$hooks/useMemberPowerTag';
import { useMemberEventParser } from '$hooks/useMemberEventParser';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useMatrixEventRenderer } from '$hooks/useMatrixEventRenderer';
import {
  EventContent,
  ImageContent,
  MessageNotDecryptedContent,
  MSticker,
  RedactedContent,
  Reply,
  Time,
} from '$components/message';
import { Image } from '$components/media';
import { ImageViewer } from '$components/image-viewer';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { ClientSideHoverFreeze } from '$components/ClientSideHoverFreeze';
import { UserAvatar } from '$components/user-avatar';
import { MessageEvent, StateEvent, GetContentCallback } from '$types/matrix/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import {
  getEditedEvent,
  getEventReactions,
  getMemberDisplayName,
  isMembershipChanged,
  reactionOrEditEvent,
  getMemberAvatarMxc,
} from '$utils/room';
import { getLinkedTimelines, getLiveTimeline } from '$utils/timeline';
import * as customHtmlCss from '$styles/CustomHtml.css';
import {
  EncryptedContent,
  Event,
  ForwardedMessageProps,
  Message,
  Reactions,
} from '$features/room/message';

import { useSableCosmetics } from '$hooks/useSableCosmetics';

function DecoratedUser({ room, userId, userName }: DecoratedUserProps) {
  const { color, font } = useSableCosmetics(userId, room ?? ({} as Room));
  return (
    <Text truncate>
      <b style={{ color, font }}> {userName ?? userId} </b>
    </Text>
  );
}

type DecoratedUserProps = {
  room: Room;
  userId: string;
  userName?: string;
};

type ThreadReplyChipProps = {
  room: Room;
  mEventId: string;
  openThreadId: string | undefined;
  onToggle: () => void;
};

function ThreadReplyChip({
  room,
  mEventId,
  openThreadId,
  onToggle,
}: Readonly<ThreadReplyChipProps>) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const nicknames = useAtomValue(nicknamesAtom);

  const thread = room.getThread(mEventId);

  const replyEvents = useMemo(() => {
    const linkedTimelines = getLinkedTimelines(getLiveTimeline(room));
    return linkedTimelines
      .flatMap((tl) => tl.getEvents())
      .filter(
        (ev) => ev.threadRootId === mEventId && ev.getId() !== mEventId && !reactionOrEditEvent(ev)
      );
  }, [room, mEventId]);

  if (!thread) return null;

  const replyCount = thread.length ?? 0;
  if (replyCount === 0) return null;

  const uniqueSenders: string[] = [];
  const seen = new Set<string>();
  replyEvents.forEach((ev) => {
    const s = ev.getSender();
    if (s && !seen.has(s)) {
      seen.add(s);
      uniqueSenders.push(s);
    }
  });

  const latestReply = replyEvents.at(-1);
  let latestSenderId = '';
  let latestBody = '';
  if (latestReply) {
    latestSenderId = latestReply.getSender() ?? '';
    latestBody = (latestReply.getContent()?.body as string | undefined) ?? '';
  }

  const latestSenderName =
    getMemberDisplayName(room, latestSenderId, nicknames) ??
    getMxIdLocalPart(latestSenderId) ??
    latestSenderId;

  const isOpen = openThreadId === mEventId;

  return (
    <Chip
      size="400"
      variant={isOpen ? 'Primary' : 'SurfaceVariant'}
      radii="300"
      before={
        uniqueSenders.length > 0 ? (
          <Box alignItems="Center" style={{ gap: 0 }}>
            {uniqueSenders.slice(0, 3).map((senderId, index) => {
              const avatarMxc = getMemberAvatarMxc(room, senderId);
              const avatarUrl = avatarMxc
                ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 20, 20, 'crop') ?? undefined)
                : undefined;
              const displayName =
                getMemberDisplayName(room, senderId, nicknames) ??
                getMxIdLocalPart(senderId) ??
                senderId;
              return (
                <Avatar key={senderId} size="200" style={{ marginLeft: index > 0 ? '-4px' : 0 }}>
                  <UserAvatar
                    userId={senderId}
                    src={avatarUrl}
                    alt={displayName}
                    renderFallback={() => (
                      <span style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1 }}>
                        {displayName[0]?.toUpperCase() ?? '?'}
                      </span>
                    )}
                  />
                </Avatar>
              );
            })}
          </Box>
        ) : undefined
      }
      onClick={onToggle}
      style={{ marginTop: config.space.S200 }}
    >
      <Text size="T300" style={{ whiteSpace: 'nowrap' }}>
        {replyCount}&nbsp;{replyCount === 1 ? 'reply' : 'replies'}
      </Text>
      {latestBody && (
        <Text
          size="T300"
          style={{
            opacity: 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: toRem(180),
          }}
        >
          &nbsp;·&nbsp;{latestSenderName}:&nbsp;{latestBody.slice(0, 60)}
        </Text>
      )}
    </Chip>
  );
}
export interface TimelineEventRendererOptions {
  room: Room;
  mx: MatrixClient;
  pushProcessor: PushProcessor;
  nicknames: Record<string, string>;
  imagePackRooms: Room[];
  settings: {
    messageLayout: MessageLayout;
    messageSpacing: any;
    hideReads: boolean;
    showDeveloperTools: boolean;
    hour24Clock: boolean;
    dateFormatString: string;
    mediaAutoLoad: boolean;
    showUrlPreview: boolean;
    showClientUrlPreview: boolean;
    autoplayStickers: boolean;
    hideMemberInReadOnly: boolean;
    isReadOnly: boolean;
    hideMembershipEvents: boolean;
    hideNickAvatarEvents: boolean;
    showHiddenEvents: boolean;
  };
  state: {
    focusItem?: { index: number; highlight: boolean; scrollTo: boolean };
    editId?: string;
    activeReplyId?: string;
    openThreadId?: string;
  };
  permissions: {
    canRedact: boolean;
    canDeleteOwn: boolean;
    canSendReaction: boolean;
    canPinEvent: boolean;
  };
  callbacks: {
    onUserClick: MouseEventHandler<HTMLButtonElement>;
    onUsernameClick: MouseEventHandler<HTMLButtonElement>;
    onReplyClick: (evt: React.MouseEvent<HTMLButtonElement>, startThread?: boolean) => void;
    onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
    onEditId: (editId?: string) => void;
    onResend: (mEvent: MatrixEvent) => void;
    onDeleteFailedSend: (mEvent: MatrixEvent) => void;
    setOpenThread: (threadId: string | undefined) => void;
    handleOpenReply: MouseEventHandler<HTMLButtonElement>;
  };
  utils: {
    htmlReactParserOptions: HTMLReactParserOptions;
    linkifyOpts: LinkifyOpts;
    getMemberPowerTag: ReturnType<typeof useGetMemberPowerTag>;
    parseMemberEvent: ReturnType<typeof useMemberEventParser>;
  };
}

export function useTimelineEventRenderer({
  room,
  mx,
  pushProcessor,
  nicknames,
  imagePackRooms,
  settings: {
    messageLayout,
    messageSpacing,
    hideReads,
    showDeveloperTools,
    hour24Clock,
    dateFormatString,
    mediaAutoLoad,
    showUrlPreview,
    showClientUrlPreview,
    autoplayStickers,
    hideMemberInReadOnly,
    isReadOnly,
    hideMembershipEvents,
    hideNickAvatarEvents,
    showHiddenEvents,
  },
  state: { focusItem, editId, activeReplyId, openThreadId },
  permissions: { canRedact, canDeleteOwn, canSendReaction, canPinEvent },
  callbacks: {
    onUserClick,
    onUsernameClick,
    onReplyClick,
    onReactionToggle,
    onEditId,
    onResend,
    onDeleteFailedSend,
    setOpenThread,
    handleOpenReply,
  },
  utils: { htmlReactParserOptions, linkifyOpts, getMemberPowerTag, parseMemberEvent },
}: TimelineEventRendererOptions) {
  const { t } = useTranslation();

  return useMatrixEventRenderer<[string, MatrixEvent, number, EventTimelineSet, boolean]>(
    {
      [MessageEvent.RoomMessage]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const {
          getContent: getEventContent,
          getOriginalContent,
          getSender,
          getAssociatedStatus,
          isRedacted,
          getUnsigned,
          getTs,
          replyEventId,
          threadRootId,
        } = mEvent;

        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const highlighted = focusItem?.index === item && focusItem.highlight;

        const pushActions = pushProcessor.actionsForEvent(mEvent);
        let notifyHighlight: 'silent' | 'loud' | undefined;
        if (pushActions?.notify && pushActions.tweaks?.highlight) {
          notifyHighlight = pushActions.tweaks?.sound ? 'loud' : 'silent';
        }

        const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
        let editedNewContent: any;
        if (editedEvent) {
          const { getContent: getEditedContent } = editedEvent;
          editedNewContent = getEditedContent.call(editedEvent)['m.new_content'];
        }

        const baseContent = getEventContent.call(mEvent) || {};
        const safeContent = (
          Object.keys(baseContent).length > 0 ? baseContent : getOriginalContent.call(mEvent)
        ) as IContent;

        const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

        const senderId = getSender.call(mEvent) ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;

        const forwardContent = safeContent['moe.sable.message.forward'] as
          | {
              original_timestamp?: unknown;
              original_room_id?: string;
              original_event_id?: string;
              original_event_private?: boolean;
            }
          | undefined;

        const messageForwardedProps: ForwardedMessageProps | undefined = forwardContent
          ? {
              isForwarded: true,
              originalTimestamp:
                typeof forwardContent.original_timestamp === 'number'
                  ? forwardContent.original_timestamp
                  : getTs.call(mEvent),
              originalRoomId: forwardContent.original_room_id ?? room.roomId,
              originalEventId: forwardContent.original_event_id ?? '',
              originalEventPrivate: forwardContent.original_event_private ?? false,
            }
          : undefined;

        return (
          <Message
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            highlight={highlighted}
            notifyHighlight={notifyHighlight}
            edit={editId === mEventId}
            canDelete={canRedact || (canDeleteOwn && senderId === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={onUserClick}
            onUsernameClick={onUsernameClick}
            onReplyClick={onReplyClick}
            onReactionToggle={onReactionToggle}
            senderId={senderId}
            senderDisplayName={senderDisplayName}
            messageForwardedProps={messageForwardedProps}
            sendStatus={getAssociatedStatus.call(mEvent)}
            onResend={onResend}
            onDeleteFailedSend={onDeleteFailedSend}
            onEditId={onEditId}
            collapse={collapse}
            activeReplyId={activeReplyId}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  mentions={baseContent['m.mentions']}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadChip =
                room.getThread(mEventId) || threadRootId ? (
                  <ThreadReplyChip
                    room={room}
                    mEventId={mEventId}
                    openThreadId={openThreadId}
                    onToggle={() => setOpenThread(openThreadId === mEventId ? undefined : mEventId)}
                  />
                ) : null;
              if (!reactionRelations && !threadChip) return undefined;
              return (
                <>
                  {reactionRelations && (
                    <Reactions
                      style={{ marginTop: config.space.S200 }}
                      room={room}
                      relations={reactionRelations}
                      mEventId={mEventId}
                      canSendReaction={canSendReaction}
                      canDeleteOwn={canDeleteOwn}
                      onReactionToggle={onReactionToggle}
                    />
                  )}
                  {threadChip}
                </>
              );
            })()}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(senderId)}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            {isRedacted.call(mEvent) ? (
              <RedactedContent reason={getUnsigned.call(mEvent).redacted_because?.content.reason} />
            ) : (
              <RenderMessageContent
                displayName={senderDisplayName}
                msgType={(editedNewContent ?? safeContent).msgtype ?? ''}
                ts={getTs.call(mEvent)}
                edited={!!editedEvent}
                getContent={getContent}
                mediaAutoLoad={mediaAutoLoad}
                urlPreview={showUrlPreview}
                clientUrlPreview={showClientUrlPreview}
                htmlReactParserOptions={htmlReactParserOptions}
                linkifyOpts={linkifyOpts}
                outlineAttachment={messageLayout === MessageLayout.Bubble}
              />
            )}
          </Message>
        );
      },
      [MessageEvent.RoomMessageEncrypted]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const {
          getSender,
          getAssociatedStatus,
          isRedacted,
          getType,
          getContent: getEventContent,
          getOriginalContent,
          getTs,
          replyEventId,
          threadRootId,
        } = mEvent;

        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = getSender.call(mEvent) ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;

        const pushActions = pushProcessor.actionsForEvent(mEvent);
        let notifyHighlight: 'silent' | 'loud' | undefined;
        if (pushActions?.notify && pushActions.tweaks?.highlight) {
          notifyHighlight = pushActions.tweaks?.sound ? 'loud' : 'silent';
        }

        return (
          <Message
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            highlight={highlighted}
            notifyHighlight={notifyHighlight}
            edit={editId === mEventId}
            canDelete={canRedact || (canDeleteOwn && senderId === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={onUserClick}
            onUsernameClick={onUsernameClick}
            onReplyClick={onReplyClick}
            onReactionToggle={onReactionToggle}
            onEditId={onEditId}
            senderId={senderId}
            activeReplyId={activeReplyId}
            senderDisplayName={senderDisplayName}
            sendStatus={getAssociatedStatus.call(mEvent)}
            onResend={onResend}
            collapse={collapse}
            onDeleteFailedSend={onDeleteFailedSend}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadChip =
                room.getThread(mEventId) || threadRootId ? (
                  <ThreadReplyChip
                    room={room}
                    mEventId={mEventId}
                    openThreadId={openThreadId}
                    onToggle={() => setOpenThread(openThreadId === mEventId ? undefined : mEventId)}
                  />
                ) : null;
              if (!reactionRelations && !threadChip) return undefined;
              return (
                <>
                  {reactionRelations && (
                    <Reactions
                      style={{ marginTop: config.space.S200 }}
                      room={room}
                      relations={reactionRelations}
                      mEventId={mEventId}
                      canSendReaction={canSendReaction}
                      canDeleteOwn={canDeleteOwn}
                      onReactionToggle={onReactionToggle}
                    />
                  )}
                  {threadChip}
                </>
              );
            })()}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(senderId)}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            <EncryptedContent mEvent={mEvent}>
              {() => {
                if (isRedacted.call(mEvent)) return <RedactedContent />;
                const type = getType.call(mEvent);
                if (type === MessageEvent.Sticker)
                  return (
                    <MSticker
                      content={getEventContent.call(mEvent) as any}
                      renderImageContent={(props) => (
                        <ImageContent
                          {...props}
                          autoPlay={mediaAutoLoad}
                          renderImage={(p) => {
                            if (!autoplayStickers && p.src) {
                              return (
                                <ClientSideHoverFreeze src={p.src}>
                                  <Image {...p} loading="lazy" />
                                </ClientSideHoverFreeze>
                              );
                            }
                            return <Image {...p} loading="lazy" />;
                          }}
                          renderViewer={(p) => <ImageViewer {...p} />}
                        />
                      )}
                    />
                  );
                if (type === MessageEvent.RoomMessage) {
                  const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
                  let editedNewContent: any;
                  if (editedEvent) {
                    const { getContent: getEditedContent } = editedEvent;
                    editedNewContent = getEditedContent.call(editedEvent)['m.new_content'];
                  }

                  const baseContent = (getEventContent.call(mEvent) || {}) as Record<string, any>;
                  const safeContent = (
                    Object.keys(baseContent).length > 0
                      ? baseContent
                      : getOriginalContent.call(mEvent)
                  ) as Record<string, any>;

                  const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

                  return (
                    <RenderMessageContent
                      displayName={senderDisplayName}
                      msgType={(editedNewContent ?? safeContent).msgtype ?? ''}
                      ts={getTs.call(mEvent)}
                      edited={!!editedEvent}
                      getContent={getContent}
                      mediaAutoLoad={mediaAutoLoad}
                      urlPreview={showUrlPreview}
                      clientUrlPreview={showClientUrlPreview}
                      htmlReactParserOptions={htmlReactParserOptions}
                      linkifyOpts={linkifyOpts}
                      outlineAttachment={messageLayout === MessageLayout.Bubble}
                    />
                  );
                }
                return (
                  <Text>
                    <MessageNotDecryptedContent />
                  </Text>
                );
              }}
            </EncryptedContent>
          </Message>
        );
      },
      [MessageEvent.Sticker]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const {
          getSender,
          getAssociatedStatus,
          isRedacted,
          getUnsigned,
          getContent: getEventContent,
          replyEventId,
          threadRootId,
        } = mEvent;

        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = getSender.call(mEvent) ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;
        const content = getEventContent.call(mEvent) ?? {};

        return (
          <Message
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            messageSpacing={messageSpacing}
            messageLayout={messageLayout}
            highlight={highlighted}
            canDelete={canRedact || (canDeleteOwn && senderId === mx.getUserId())}
            canSendReaction={canSendReaction}
            canPinEvent={canPinEvent}
            imagePackRooms={imagePackRooms}
            relations={hasReactions ? reactionRelations : undefined}
            onUserClick={onUserClick}
            onUsernameClick={onUsernameClick}
            onReplyClick={onReplyClick}
            onReactionToggle={onReactionToggle}
            senderId={senderId}
            activeReplyId={activeReplyId}
            senderDisplayName={senderDisplayName}
            sendStatus={getAssociatedStatus.call(mEvent)}
            onResend={onResend}
            onDeleteFailedSend={onDeleteFailedSend}
            collapse={collapse}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={threadRootId}
                  mentions={content['m.mentions']}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadChip =
                room.getThread(mEventId) || threadRootId ? (
                  <ThreadReplyChip
                    room={room}
                    mEventId={mEventId}
                    openThreadId={openThreadId}
                    onToggle={() => setOpenThread(openThreadId === mEventId ? undefined : mEventId)}
                  />
                ) : null;
              if (!reactionRelations && !threadChip) return undefined;
              return (
                <>
                  {reactionRelations && (
                    <Reactions
                      style={{ marginTop: config.space.S200 }}
                      room={room}
                      relations={reactionRelations}
                      mEventId={mEventId}
                      canSendReaction={canSendReaction}
                      canDeleteOwn={canDeleteOwn}
                      onReactionToggle={onReactionToggle}
                    />
                  )}
                  {threadChip}
                </>
              );
            })()}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            memberPowerTag={getMemberPowerTag(senderId)}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          >
            {isRedacted.call(mEvent) ? (
              <RedactedContent reason={getUnsigned.call(mEvent).redacted_because?.content.reason} />
            ) : (
              <MSticker
                content={getEventContent.call(mEvent) as any}
                renderImageContent={(props) => (
                  <ImageContent
                    {...props}
                    autoPlay={mediaAutoLoad}
                    renderImage={(p) => {
                      if (!autoplayStickers && p.src) {
                        return (
                          <ClientSideHoverFreeze src={p.src}>
                            <Image {...p} loading="lazy" />
                          </ClientSideHoverFreeze>
                        );
                      }
                      return <Image {...p} loading="lazy" />;
                    }}
                    renderViewer={(p) => <ImageViewer {...p} />}
                  />
                )}
              />
            )}
          </Message>
        );
      },
      [StateEvent.RoomMember]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const { getTs, getSender } = mEvent;
        const membershipChanged = isMembershipChanged(mEvent);
        if (hideMemberInReadOnly && isReadOnly) return null;
        if (membershipChanged && hideMembershipEvents) return null;
        if (!membershipChanged && hideNickAvatarEvents) return null;

        const highlighted = focusItem?.index === item && focusItem.highlight;
        const parsed = parseMemberEvent(mEvent);

        const timeJSX = (
          <Time
            ts={getTs.call(mEvent)}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            collapse={collapse}
            canDelete={canRedact || getSender.call(mEvent) === mx.getUserId()}
            onReplyClick={onReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            messageSpacing={messageSpacing}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={parsed.icon}
              content={
                <Text size="T300" priority="300">
                  <Box direction="Row" style={{ flexWrap: 'wrap', columnGap: toRem(6) }}>
                    {parsed.body}
                  </Box>
                </Text>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomName]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const { getTs, getSender } = mEvent;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = getSender.call(mEvent) ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);
        const timeJSX = (
          <Time
            ts={getTs.call(mEvent)}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            collapse={collapse}
            canDelete={canRedact || senderId === mx.getUserId()}
            onReplyClick={onReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            messageSpacing={messageSpacing}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <DecoratedUser userId={senderId} userName={senderName} room={room} />
                    {t('Organisms.RoomCommon.changed_room_name')}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomTopic]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const { getTs, getSender } = mEvent;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = getSender.call(mEvent) ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={getTs.call(mEvent)}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            collapse={collapse}
            canDelete={canRedact || senderId === mx.getUserId()}
            onReplyClick={onReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            messageSpacing={messageSpacing}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <DecoratedUser userId={senderId} userName={senderName} room={room} />
                    {' changed room topic'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomAvatar]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const { getTs, getSender } = mEvent;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = getSender.call(mEvent) ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={getTs.call(mEvent)}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            collapse={collapse}
            canDelete={canRedact || senderId === mx.getUserId()}
            onReplyClick={onReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            messageSpacing={messageSpacing}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Hash}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <DecoratedUser userId={senderId} userName={senderName} room={room} />
                    {' changed room avatar'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.GroupCallMemberPrefix]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const { getTs, getSender, getContent: getEventContent, getPrevContent } = mEvent;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = getSender.call(mEvent) ?? '';
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const content = getEventContent.call(mEvent) as SessionMembershipData;
        const prevContent = getPrevContent.call(mEvent);

        const callJoined = content.application;
        if (callJoined && 'application' in prevContent) {
          return null;
        }

        const timeJSX = (
          <Time
            ts={getTs.call(mEvent)}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            collapse={collapse}
            canDelete={canRedact || senderId === mx.getUserId()}
            hideReadReceipts={hideReads}
            onReplyClick={onReplyClick}
            showDeveloperTools={showDeveloperTools}
            messageSpacing={messageSpacing}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={callJoined ? Icons.Phone : Icons.PhoneDown}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <DecoratedUser userId={senderId} userName={senderName} room={room} />
                    {callJoined ? ' joined the call' : ' ended the call'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [StateEvent.RoomPinnedEvents]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const { getSender, getTs, getContent, getPrevContent } = mEvent;
        if (!showHiddenEvents) return null;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const senderId = getSender.call(mEvent) ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const { pinned } = getContent.call(mEvent);
        const prevPinned = getPrevContent.call(mEvent).pinned;
        const pinsAdded =
          prevPinned && pinned && pinned.filter((x: string) => !prevPinned.includes(x));
        const pinsRemoved =
          prevPinned && pinned && prevPinned.filter((x: string) => !pinned.includes(x));

        const timeJSX = (
          <Time
            ts={getTs.call(mEvent)}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        return (
          <Event
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            collapse={collapse}
            canDelete={canRedact || senderId === mx.getUserId()}
            onReplyClick={onReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            messageSpacing={messageSpacing}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              iconSrc={Icons.Pin}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <DecoratedUser userId={senderId} userName={senderName} room={room} />
                    {(pinsAdded?.length > 0 &&
                      `pinned ${pinsAdded.length} message${pinsAdded.length > 1 ? 's' : ''}`) ||
                      ''}
                    {(pinsAdded?.length > 0 && pinsRemoved?.length > 0 && ` and`) || ''}
                    {(pinsRemoved?.length > 0 &&
                      `unpinned ${pinsRemoved.length} message${pinsRemoved.length > 1 ? 's' : ''}`) ||
                      ''}
                    {((!pinsAdded || pinsAdded.length <= 0) &&
                      (!pinsRemoved || pinsRemoved.length <= 0) &&
                      `has not changed the pins`) ||
                      `:`}
                  </Text>
                  {(pinsAdded || pinsRemoved) &&
                    pinsAdded
                      .concat(pinsRemoved)
                      .slice(0, 4)
                      .map((x: string) => (
                        <Reply
                          style={{ opacity: '80%' }}
                          room={room}
                          replyEventId={x ?? ''}
                          onClick={handleOpenReply}
                          replyIcon={
                            <>
                              <Icon size="100" src={Icons.Pin} />
                              <Icon
                                size="100"
                                src={pinned.includes(x) ? Icons.Plus : Icons.Minus}
                              />
                            </>
                          }
                        />
                      ))}
                </Box>
              }
            />
          </Event>
        );
      },
    },
    (mEventId, mEvent, item, timelineSet, collapse) => {
      const { getSender, getTs, getType } = mEvent;
      if (!showHiddenEvents) return null;
      const highlighted = focusItem?.index === item && focusItem.highlight;
      const senderId = getSender.call(mEvent) ?? '';
      const senderName =
        getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={getTs.call(mEvent)}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      );

      return (
        <Event
          key={mEventId}
          data-message-item={item}
          data-message-id={mEventId}
          room={room}
          mEvent={mEvent}
          highlight={highlighted}
          collapse={collapse}
          canDelete={canRedact || senderId === mx.getUserId()}
          onReplyClick={onReplyClick}
          hideReadReceipts={hideReads}
          showDeveloperTools={showDeveloperTools}
          messageSpacing={messageSpacing}
        >
          <EventContent
            messageLayout={messageLayout}
            time={timeJSX}
            iconSrc={Icons.Code}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <DecoratedUser userId={senderId} userName={senderName} room={room} />
                  {' sent '}
                  <code className={customHtmlCss.Code}>{getType.call(mEvent)}</code>
                  {' state event'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    },
    (mEventId, mEvent, item, timelineSet, collapse) => {
      const {
        getContent: getEventContent,
        getRelation,
        isRedaction,
        getSender,
        getTs,
        getType,
      } = mEvent;
      if (!showHiddenEvents) return null;
      if (Object.keys(getEventContent.call(mEvent)).length === 0) return null;
      if (getRelation.call(mEvent)) return null;
      if (isRedaction.call(mEvent)) return null;

      const highlighted = focusItem?.index === item && focusItem.highlight;
      const senderId = getSender.call(mEvent) ?? '';
      const senderName =
        getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={getTs.call(mEvent)}
          compact={messageLayout === MessageLayout.Compact}
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      );

      return (
        <Event
          key={mEventId}
          data-message-item={item}
          data-message-id={mEventId}
          room={room}
          mEvent={mEvent}
          highlight={highlighted}
          collapse={collapse}
          canDelete={canRedact || senderId === mx.getUserId()}
          onReplyClick={onReplyClick}
          hideReadReceipts={hideReads}
          showDeveloperTools={showDeveloperTools}
          messageSpacing={messageSpacing}
        >
          <EventContent
            messageLayout={messageLayout}
            time={timeJSX}
            iconSrc={Icons.Code}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <b>{senderName}</b>
                  {' sent '}
                  <code className={customHtmlCss.Code}>{getType.call(mEvent)}</code>
                  {' event'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    }
  );
}
