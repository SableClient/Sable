import type { MouseEventHandler } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import type {
  IThreadBundledRelationship,
  MatrixClient,
  MatrixEvent,
  Room,
  PushProcessor,
  EventTimelineSet,
} from '$types/matrix-sdk';
import type { IImageContent } from '$types/matrix/common';
import { NotificationCountType, RoomEvent, ThreadEvent, EventType } from '$types/matrix-sdk';
import type { SessionMembershipData } from '$types/matrix-sdk';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { Box, Chip, Avatar, Text, config, toRem } from 'folds';
import {
  Code,
  Hash,
  menuIcon,
  PencilSimple,
  Phone,
  PhoneDisconnect,
  PushPin,
  PushPinSlash,
  Smiley,
  timelineIcon,
  Trash,
} from '$components/icons/phosphor';
import type { ResolvedHiddenEventSettings } from '$state/hooks/settings';
import { MessageLayout, type MessageSpacing } from '$state/settings';
import { nicknamesAtom } from '$state/nicknames';
import type { useGetMemberPowerTag } from '$hooks/useMemberPowerTag';
import type { useMemberEventParser } from '$hooks/useMemberEventParser';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useMatrixEventRenderer } from '$hooks/useMatrixEventRenderer';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import {
  EventContent,
  ImageContent,
  InlineTextDiff,
  MessageNotDecryptedContent,
  MSticker,
  RedactedContent,
  RedactedReactionContent,
  Reply,
  ReactionKeyInline,
  Time,
} from '$components/message';
import { Image } from '$components/media';
import { ImageViewer } from '$components/image-viewer';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { ClientSideHoverFreeze } from '$components/ClientSideHoverFreeze';
import { UserAvatar } from '$components/user-avatar';
import type { GetContentCallback } from '$types/matrix/room';

import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import {
  getEditedEvent,
  getEditChain,
  getEditDiffBodies,
  getEditTargetId,
  getEventReactions,
  getMemberDisplayName,
  getPreviousEditId,
  getRedactionTargetEvent,
  getRedactionTargetId,
  getReactionKey,
  getReactionShortcode,
  getReactionAnnotationTargetId,
  getRedactionReason,
  isEditEvent,
  isMembershipChanged,
  isThreadRelationEvent,
  reactionOrEditEvent,
  getMemberAvatarMxc,
} from '$utils/room';
import { getLinkedTimelines, getLiveTimeline } from '$utils/timeline';
import * as customHtmlCss from '$styles/CustomHtml.css';
import { UnreadBadge, UnreadBadgeCenter } from '$components/unread-badge';
import type { ForwardedMessageProps } from '$features/room/message';
import { EncryptedContent, Event, Message, Reactions } from '$features/room/message';

import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { M_POLL_START } from 'matrix-js-sdk';

function DecoratedUser({ room, userId, userName }: DecoratedUserProps) {
  const { color, font } = useSableCosmetics(userId, room ?? ({} as Room));

  const openUserRoomProfile = useOpenUserRoomProfile();
  const handleUserClick: MouseEventHandler = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openUserRoomProfile(
        room.roomId,
        undefined,
        userId,
        evt.currentTarget.getBoundingClientRect()
      );
    },
    [room, userId, openUserRoomProfile]
  );

  return (
    <Text as="a" onClick={handleUserClick} truncate>
      <b style={{ color, font }}>{userName ?? userId} </b>
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

  const [counter, forceUpdate] = useState(0);

  const thread = room.getThread(mEventId);

  useEffect(() => {
    if (!thread) return () => {};
    const onUpdate = () => forceUpdate((n) => n + 1);
    thread.on(ThreadEvent.NewReply, onUpdate);
    thread.on(ThreadEvent.Update, onUpdate);
    room.on(RoomEvent.Redaction, onUpdate);
    return () => {
      thread.off(ThreadEvent.NewReply, onUpdate);
      thread.off(ThreadEvent.Update, onUpdate);
      room.off(RoomEvent.Redaction, onUpdate);
    };
  }, [room, thread]);

  const replyEvents = useMemo(() => {
    // `counter` is a cache-busting key. Touch it so the dependency is explicit.
    void counter;
    // With threadSupport:true, reply events live in thread.timelineSet not the main room timeline.
    // Prefer thread.events when available so avatars and preview text are populated.
    if (thread) {
      const fromThread = thread.events.filter(
        (ev) =>
          ev.getId() !== mEventId && !reactionOrEditEvent(ev) && isThreadRelationEvent(ev, mEventId)
      );
      if (fromThread.length > 0) return fromThread;
    }
    const linkedTimelines = getLinkedTimelines(getLiveTimeline(room));
    return linkedTimelines
      .flatMap((tl) => tl.getEvents())
      .filter(
        (ev) =>
          ev.getId() !== mEventId && !reactionOrEditEvent(ev) && isThreadRelationEvent(ev, mEventId)
      );
  }, [room, mEventId, thread, counter]);

  if (!thread) return null;

  // Prefer the server-authoritative bundled count. thread.length only reflects
  // events fetched into the local timeline, which can be much lower than the
  // true total before the thread drawer is first opened and paginated.
  const bundledCount =
    thread.rootEvent?.getServerAggregatedRelation<IThreadBundledRelationship>('m.thread')?.count;
  const replyCount = bundledCount ?? thread.length ?? 0;
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

  const unreadTotal = room.getThreadUnreadNotificationCount(mEventId, NotificationCountType.Total);
  const unreadHighlight = room.getThreadUnreadNotificationCount(
    mEventId,
    NotificationCountType.Highlight
  );

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
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 'bold',
                          lineHeight: 1,
                        }}
                      >
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
      {unreadTotal > 0 && (
        <UnreadBadgeCenter>
          <UnreadBadge highlight={unreadHighlight > 0} count={unreadTotal} />
        </UnreadBadgeCenter>
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
    messageSpacing: MessageSpacing;
    hideReads: boolean;
    showDeveloperTools: boolean;
    hour24Clock: boolean;
    dateFormatString: string;
    mediaAutoLoad: boolean;
    showUrlPreview: boolean;
    showBundledPreview: boolean;
    showClientUrlPreview: boolean;
    showMaps?: boolean;
    autoplayStickers: boolean;
    hideMemberInReadOnly: boolean;
    isReadOnly: boolean;
    hideMembershipEvents: boolean;
    hideNickAvatarEvents: boolean;
    hiddenEvents: ResolvedHiddenEventSettings;
    hideThreadChip?: boolean;
  };
  state: {
    focusItem?: { index: number; highlight: boolean; scrollTo: boolean };
    editId?: string;
    activeReplyId?: string;
    openThreadId?: string;
    suppressMark?: boolean;
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
    showBundledPreview,
    showUrlPreview,
    showClientUrlPreview,
    showMaps,
    autoplayStickers,
    hideMemberInReadOnly,
    isReadOnly,
    hideMembershipEvents,
    hideNickAvatarEvents,
    hiddenEvents,
    hideThreadChip,
  },
  state: { focusItem, editId, activeReplyId, openThreadId, suppressMark },
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
  const {
    hiddenEventEdits,
    hiddenEventRedactionTimeline,
    hiddenEventReactions,
    hiddenEventReactionTombstone,
    hiddenEventReactionRedactionTimeline,
    hiddenEventOther,
  } = hiddenEvents;
  const useAuthentication = useMediaAuthentication();

  const renderEditTimelineEvent = (
    mEventId: string,
    mEvent: MatrixEvent,
    item: number,
    timelineSet: EventTimelineSet,
    collapse: boolean
  ) => {
    if (!hiddenEventEdits) return null;

    const highlighted = focusItem?.index === item && focusItem.highlight;
    const marked = activeReplyId === mEventId && suppressMark !== true;
    const senderId = mEvent.getSender() ?? '';
    const senderName =
      getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);
    const editTargetId = getEditTargetId(mEvent);
    const chain = editTargetId && getEditChain(timelineSet, editTargetId, mEvent.getType(), room);
    const previousEditId = chain ? getPreviousEditId(mEvent, chain) : undefined;
    const replyEventId = previousEditId ?? editTargetId;
    const { oldBody, newBody } = getEditDiffBodies(mEvent, timelineSet, room);
    const canShowDiff =
      typeof oldBody === 'string' && typeof newBody === 'string' && oldBody !== newBody;

    const timeJSX = (
      <Time
        ts={mEvent.getTs()}
        compact={messageLayout === MessageLayout.Compact}
        hour24Clock={hour24Clock}
        dateFormatString={dateFormatString}
      />
    );

    const targetReply =
      typeof replyEventId === 'string' ? (
        <Reply
          style={{ opacity: '80%' }}
          room={room}
          timelineSet={timelineSet}
          replyEventId={replyEventId}
          previewBodyOverride={oldBody}
          onClick={handleOpenReply}
        />
      ) : null;

    return (
      <Event
        key={mEventId}
        data-message-item={item}
        data-message-id={mEventId}
        room={room}
        mEvent={mEvent}
        highlight={highlighted}
        isMarked={marked}
        collapse={collapse}
        canDelete={false}
        onReplyClick={onReplyClick}
        hideReadReceipts={hideReads}
        showDeveloperTools={showDeveloperTools}
        messageSpacing={messageSpacing}
      >
        <EventContent
          messageLayout={messageLayout}
          time={timeJSX}
          icon={timelineIcon(PencilSimple)}
          content={
            <Box grow="Yes" direction="Column">
              {targetReply}
              <Text size="T300" priority="300">
                <DecoratedUser userId={senderId} userName={senderName} room={room} />
                {canShowDiff ? ' edited a message:' : ' edited a message'}
              </Text>
              {canShowDiff && <InlineTextDiff oldText={oldBody} newText={newBody} />}
            </Box>
          }
        />
      </Event>
    );
  };

  return useMatrixEventRenderer<[string, MatrixEvent, number, EventTimelineSet, boolean]>(
    {
      [EventType.RoomMessage]: (mEventId, mEvent, item, timelineSet, collapse) => {
        if (isEditEvent(mEvent)) {
          return renderEditTimelineEvent(mEventId, mEvent, item, timelineSet, collapse);
        }

        const { replyEventId: rawReplyEventId, threadRootId } = mEvent;
        const isThreadRel = isThreadRelationEvent(mEvent, threadRootId);
        const actualThreadRootId = isThreadRel ? threadRootId : undefined;
        const explicitInReplyTo = mEvent.getWireContent()?.['m.relates_to']?.['m.in_reply_to']
          ?.event_id as unknown;
        const threadReplyTargetId =
          isThreadRel && typeof explicitInReplyTo === 'string' ? explicitInReplyTo : undefined;
        // In the thread drawer (hideThreadChip=true), suppress reply headers for events
        // that only have m.in_reply_to as a non-thread-client fallback (is_falling_back: true).
        const replyEventId =
          hideThreadChip && mEvent.getWireContent()?.['m.relates_to']?.is_falling_back
            ? undefined
            : (threadReplyTargetId ?? rawReplyEventId);

        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;

        const pushActions = pushProcessor.actionsForEvent(mEvent);
        let notifyHighlight: 'silent' | 'loud' | undefined;
        if (pushActions?.notify && pushActions.tweaks?.highlight) {
          notifyHighlight = pushActions.tweaks?.sound ? 'loud' : 'silent';
        }

        const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
        let editedNewContent: unknown;
        if (editedEvent) {
          editedNewContent = editedEvent.getContent()['m.new_content'];
        }

        const baseContent = mEvent.getContent() || {};
        const safeContent =
          Object.keys(baseContent).length > 0 ? baseContent : mEvent.getOriginalContent();

        const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

        const senderId = mEvent.getSender() ?? '';
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
                  : mEvent.getTs(),
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
            isMarked={marked}
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
            sendStatus={mEvent.getAssociatedStatus()}
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
                  threadRootId={hideThreadChip ? undefined : actualThreadRootId}
                  mentions={baseContent['m.mentions']}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadChip =
                !hideThreadChip && (room.getThread(mEventId) || threadRootId) ? (
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
                      imagePackRooms={imagePackRooms}
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
            {mEvent.isRedacted() ? (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            ) : (
              <RenderMessageContent
                displayName={senderDisplayName}
                msgType={((editedNewContent ?? safeContent) as { msgtype?: string }).msgtype ?? ''}
                ts={mEvent.getTs()}
                edited={!!editedEvent}
                getContent={getContent}
                mediaAutoLoad={mediaAutoLoad}
                urlPreview={showUrlPreview}
                bundledPreview={showBundledPreview}
                clientUrlPreview={showClientUrlPreview}
                showMaps={showMaps}
                htmlReactParserOptions={htmlReactParserOptions}
                linkifyOpts={linkifyOpts}
                outlineAttachment={messageLayout === MessageLayout.Bubble}
                mx={mx}
                room={room}
              />
            )}
          </Message>
        );
      },
      [EventType.RoomMessageEncrypted]: (mEventId, mEvent, item, timelineSet, collapse) => {
        if (isEditEvent(mEvent)) {
          return renderEditTimelineEvent(mEventId, mEvent, item, timelineSet, collapse);
        }

        const { replyEventId: rawReplyEventId, threadRootId } = mEvent;
        const isThreadRel = isThreadRelationEvent(mEvent, threadRootId);
        const actualThreadRootId = isThreadRel ? threadRootId : undefined;
        const explicitInReplyTo = mEvent.getWireContent()?.['m.relates_to']?.['m.in_reply_to']
          ?.event_id as unknown;
        const threadReplyTargetId =
          isThreadRel && typeof explicitInReplyTo === 'string' ? explicitInReplyTo : undefined;
        const replyEventId =
          hideThreadChip && mEvent.getWireContent()?.['m.relates_to']?.is_falling_back
            ? undefined
            : (threadReplyTargetId ?? rawReplyEventId);

        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;
        const senderId = mEvent.getSender() ?? '';
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
            isMarked={marked}
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
            sendStatus={mEvent.getAssociatedStatus()}
            onResend={onResend}
            collapse={collapse}
            onDeleteFailedSend={onDeleteFailedSend}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={hideThreadChip ? undefined : actualThreadRootId}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadChip =
                !hideThreadChip && (room.getThread(mEventId) || threadRootId) ? (
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
                      imagePackRooms={imagePackRooms}
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
                if (mEvent.isRedacted()) return <RedactedContent />;
                const type = mEvent.getType();
                if (type === (EventType.Sticker as string))
                  return (
                    <MSticker
                      content={mEvent.getContent() as unknown as IImageContent}
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
                if (type === (EventType.RoomMessage as string)) {
                  const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
                  let editedNewContent: unknown;
                  if (editedEvent) {
                    editedNewContent = editedEvent.getContent()['m.new_content'];
                  }

                  const baseContent = mEvent.getContent() || {};
                  const safeContent =
                    Object.keys(baseContent).length > 0 ? baseContent : mEvent.getOriginalContent();

                  const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

                  return (
                    <RenderMessageContent
                      displayName={senderDisplayName}
                      msgType={
                        (
                          (editedNewContent ?? safeContent) as {
                            msgtype?: string;
                          }
                        ).msgtype ?? ''
                      }
                      ts={mEvent.getTs()}
                      edited={!!editedEvent}
                      getContent={getContent}
                      mediaAutoLoad={mediaAutoLoad}
                      bundledPreview={showBundledPreview}
                      urlPreview={showUrlPreview}
                      clientUrlPreview={showClientUrlPreview}
                      htmlReactParserOptions={htmlReactParserOptions}
                      linkifyOpts={linkifyOpts}
                      outlineAttachment={messageLayout === MessageLayout.Bubble}
                      mx={mx}
                      room={room}
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
      [EventType.Sticker]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const { replyEventId: rawReplyEventId, threadRootId } = mEvent;
        const isThreadRel = isThreadRelationEvent(mEvent, threadRootId);
        const actualThreadRootId = isThreadRel ? threadRootId : undefined;
        const explicitInReplyTo = mEvent.getWireContent()?.['m.relates_to']?.['m.in_reply_to']
          ?.event_id as unknown;
        const threadReplyTargetId =
          isThreadRel && typeof explicitInReplyTo === 'string' ? explicitInReplyTo : undefined;
        const replyEventId =
          hideThreadChip && mEvent.getWireContent()?.['m.relates_to']?.is_falling_back
            ? undefined
            : (threadReplyTargetId ?? rawReplyEventId);

        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;
        const senderId = mEvent.getSender() ?? '';
        const senderDisplayName =
          getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;
        const content = mEvent.getContent() ?? {};

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
            isMarked={marked}
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
            sendStatus={mEvent.getAssociatedStatus()}
            onResend={onResend}
            onDeleteFailedSend={onDeleteFailedSend}
            collapse={collapse}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={hideThreadChip ? undefined : actualThreadRootId}
                  mentions={content['m.mentions']}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadChip =
                !hideThreadChip && (room.getThread(mEventId) || threadRootId) ? (
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
                      imagePackRooms={imagePackRooms}
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
            {mEvent.isRedacted() ? (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            ) : (
              <MSticker
                content={mEvent.getContent() as unknown as IImageContent}
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
      [M_POLL_START.name]: (mEventId, mEvent, item, timelineSet) => {
        const { replyEventId: rawReplyEventId, threadRootId } = mEvent;
        const isThreadRel = isThreadRelationEvent(mEvent, threadRootId);
        const actualThreadRootId = isThreadRel ? threadRootId : undefined;
        const explicitInReplyTo = mEvent.getWireContent()?.['m.relates_to']?.['m.in_reply_to']
          ?.event_id as unknown;
        const threadReplyTargetId =
          isThreadRel && typeof explicitInReplyTo === 'string' ? explicitInReplyTo : undefined;
        // In the thread drawer (hideThreadChip=true), suppress reply headers for events
        // that only have m.in_reply_to as a non-thread-client fallback (is_falling_back: true).
        const replyEventId =
          hideThreadChip && mEvent.getWireContent()?.['m.relates_to']?.is_falling_back
            ? undefined
            : (threadReplyTargetId ?? rawReplyEventId);

        const reactionRelations = getEventReactions(timelineSet, mEventId);
        const reactions = reactionRelations?.getSortedAnnotationsByKey();
        const hasReactions = reactions && reactions.length > 0;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;

        const pushActions = pushProcessor.actionsForEvent(mEvent);
        let notifyHighlight: 'silent' | 'loud' | undefined;
        if (pushActions?.notify && pushActions.tweaks?.highlight) {
          notifyHighlight = pushActions.tweaks?.sound ? 'loud' : 'silent';
        }

        const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
        let editedNewContent: unknown;
        if (editedEvent) {
          editedNewContent = editedEvent.getContent()['m.new_content'];
        }

        const baseContent = mEvent.getContent() || {};
        const safeContent =
          Object.keys(baseContent).length > 0 ? baseContent : mEvent.getOriginalContent();

        const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

        const senderId = mEvent.getSender() ?? '';
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
                  : mEvent.getTs(),
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
            isMarked={marked}
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
            sendStatus={mEvent.getAssociatedStatus()}
            onResend={onResend}
            onDeleteFailedSend={onDeleteFailedSend}
            onEditId={onEditId}
            collapse={false}
            activeReplyId={activeReplyId}
            reply={
              replyEventId && (
                <Reply
                  room={room}
                  timelineSet={timelineSet}
                  replyEventId={replyEventId}
                  threadRootId={hideThreadChip ? undefined : actualThreadRootId}
                  mentions={baseContent['m.mentions']}
                  onClick={handleOpenReply}
                />
              )
            }
            reactions={(() => {
              const threadChip =
                !hideThreadChip && (room.getThread(mEventId) || threadRootId) ? (
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
                      imagePackRooms={imagePackRooms}
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
            {mEvent.isRedacted() ? (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            ) : (
              <RenderMessageContent
                displayName={senderDisplayName}
                msgType={((editedNewContent ?? safeContent) as { msgtype?: string }).msgtype ?? ''}
                ts={mEvent.getTs()}
                edited={!!editedEvent}
                getContent={getContent}
                mediaAutoLoad={mediaAutoLoad}
                urlPreview={showUrlPreview}
                bundledPreview={showBundledPreview}
                clientUrlPreview={showClientUrlPreview}
                htmlReactParserOptions={htmlReactParserOptions}
                linkifyOpts={linkifyOpts}
                outlineAttachment={messageLayout === MessageLayout.Bubble}
                mEvent={mEvent}
                mx={mx}
                room={room}
              />
            )}
          </Message>
        );
      },
      [EventType.RoomMember]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const membershipChanged = isMembershipChanged(mEvent);
        if (hideMemberInReadOnly && isReadOnly) return null;
        if (membershipChanged && hideMembershipEvents) return null;
        if (!membershipChanged && hideNickAvatarEvents) return null;

        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;
        const parsed = parseMemberEvent(mEvent);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
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
            isMarked={marked}
            collapse={collapse}
            canDelete={canRedact || mEvent.getSender() === mx.getUserId()}
            onReplyClick={onReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            messageSpacing={messageSpacing}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              icon={parsed.icon}
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
      [EventType.RoomName]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);
        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
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
            isMarked={marked}
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
              icon={timelineIcon(Hash)}
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
      [EventType.RoomTopic]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
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
            isMarked={marked}
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
              icon={timelineIcon(Hash)}
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
      [EventType.RoomAvatar]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
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
            isMarked={marked}
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
              icon={timelineIcon(Hash)}
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
      [EventType.GroupCallMemberPrefix]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;
        const senderId = mEvent.getSender() ?? '';
        const senderName = getMemberDisplayName(room, senderId) || getMxIdLocalPart(senderId);

        const content = mEvent.getContent() as SessionMembershipData;
        const prevContent = mEvent.getPrevContent();

        const callJoined = content.application;
        if (callJoined && 'application' in prevContent) {
          return null;
        }

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
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
            isMarked={marked}
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
              icon={callJoined ? timelineIcon(Phone) : timelineIcon(PhoneDisconnect)}
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
      [EventType.Reaction]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);
        const targetId = getReactionAnnotationTargetId(mEvent) ?? mEvent.getRelation()?.event_id;

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        const targetReply =
          typeof targetId === 'string' ? (
            <Reply
              style={{ opacity: '80%' }}
              room={room}
              timelineSet={timelineSet}
              replyEventId={targetId}
              onClick={handleOpenReply}
            />
          ) : null;

        if (mEvent.isRedacted()) {
          if (!hiddenEventReactionTombstone) return null;
          const reactionKey = getReactionKey(mEvent);
          const reactionShortcode = getReactionShortcode(mEvent);
          const removalReason = getRedactionReason(mEvent);

          return (
            <Event
              key={mEventId}
              data-message-item={item}
              data-message-id={mEventId}
              room={room}
              mEvent={mEvent}
              highlight={highlighted}
              isMarked={marked}
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
                icon={timelineIcon(Trash)}
                content={
                  <Box grow="Yes" direction="Column">
                    {targetReply}
                    <RedactedReactionContent
                      reactionKey={reactionKey}
                      shortcode={reactionShortcode}
                      mx={mx}
                      useAuthentication={useAuthentication}
                      reason={removalReason}
                    />
                  </Box>
                }
              />
            </Event>
          );
        }

        if (!hiddenEventReactions) return null;

        const reactionKey = getReactionKey(mEvent) ?? mEvent.getRelation()?.key ?? '';
        const reactionShortcode = getReactionShortcode(mEvent);

        return (
          <Event
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            isMarked={marked}
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
              icon={timelineIcon(Smiley)}
              content={
                <Box grow="Yes" direction="Column">
                  {targetReply}
                  <Text size="T300" priority="300">
                    <DecoratedUser userId={senderId} userName={senderName} room={room} />
                    {' reacted with '}
                    <ReactionKeyInline
                      mx={mx}
                      reactionKey={reactionKey}
                      shortcode={reactionShortcode}
                      useAuthentication={useAuthentication}
                    />
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [EventType.RoomRedaction]: (mEventId, mEvent, item, timelineSet, collapse) => {
        const target = getRedactionTargetEvent(timelineSet, mEvent);
        const isReactionRedaction = target?.getType() === (EventType.Reaction as string);
        if (isReactionRedaction) {
          if (!hiddenEventReactionRedactionTimeline) return null;
        } else if (!hiddenEventRedactionTimeline) {
          return null;
        }

        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);
        const targetId = getRedactionTargetId(mEvent);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
            compact={messageLayout === MessageLayout.Compact}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        );

        const targetReply = targetId ? (
          <Reply
            style={{ opacity: '80%' }}
            room={room}
            timelineSet={timelineSet}
            replyEventId={targetId}
            onClick={handleOpenReply}
          />
        ) : null;

        return (
          <Event
            key={mEventId}
            data-message-item={item}
            data-message-id={mEventId}
            room={room}
            mEvent={mEvent}
            highlight={highlighted}
            isMarked={marked}
            collapse={collapse}
            canDelete={false}
            onReplyClick={onReplyClick}
            hideReadReceipts={hideReads}
            showDeveloperTools={showDeveloperTools}
            messageSpacing={messageSpacing}
          >
            <EventContent
              messageLayout={messageLayout}
              time={timeJSX}
              icon={timelineIcon(Trash)}
              content={
                <Box grow="Yes" direction="Column">
                  {targetReply}
                  <Text size="T300" priority="300">
                    <DecoratedUser userId={senderId} userName={senderName} room={room} />
                    {isReactionRedaction ? ' redacted a reaction' : ' redacted a message'}
                  </Text>
                </Box>
              }
            />
          </Event>
        );
      },
      [EventType.RoomPinnedEvents]: (mEventId, mEvent, item, timelineSet, collapse) => {
        if (!hiddenEventOther) return null;
        const highlighted = focusItem?.index === item && focusItem.highlight;
        const marked = activeReplyId === mEventId && !suppressMark;
        const senderId = mEvent.getSender() ?? '';
        const senderName =
          getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

        const { pinned } = mEvent.getContent();
        const prevPinned = mEvent.getPrevContent().pinned;
        const pinsAdded = prevPinned
          ? pinned?.filter((x: string) => !prevPinned.includes(x))
          : pinned?.filter((x: string) => x.length > 0);
        const pinsRemoved =
          (prevPinned && pinned && prevPinned.filter((x: string) => !pinned.includes(x))) || [];

        const pinPreviewIds = (pinsAdded ?? []).concat(...(pinsRemoved ?? []));
        const pinnedSet = new Set(pinned ?? []);

        const timeJSX = (
          <Time
            ts={mEvent.getTs()}
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
            isMarked={marked}
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
              icon={timelineIcon(PushPin)}
              content={
                <Box grow="Yes" direction="Column">
                  <Text size="T300" priority="300">
                    <DecoratedUser userId={senderId} userName={senderName} room={room} />
                    {(pinsAdded?.length > 0 &&
                      `pinned ${pinsAdded.length} message${pinsAdded.length > 1 ? 's' : ''}`) ||
                      ''}
                    {(pinsAdded?.length > 0 && pinsRemoved?.length > 0 && ` and `) || ''}
                    {(pinsRemoved?.length > 0 &&
                      `unpinned ${pinsRemoved.length} message${
                        pinsRemoved.length > 1 ? 's' : ''
                      }`) ||
                      ''}
                    {((!pinsAdded || pinsAdded.length <= 0) &&
                      (!pinsRemoved || pinsRemoved.length <= 0) &&
                      `has not changed the pins`) ||
                      `:`}
                  </Text>
                  {pinPreviewIds.length > 0 &&
                    pinPreviewIds
                      .slice(0, 4)
                      .map((x: string) => (
                        <Reply
                          key={x}
                          style={{ opacity: '80%' }}
                          room={room}
                          replyEventId={x}
                          onClick={handleOpenReply}
                          replyIcon={<>{menuIcon(pinnedSet.has(x) ? PushPin : PushPinSlash)}</>}
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
      if (!hiddenEventOther) return null;
      const highlighted = focusItem?.index === item && focusItem.highlight;
      const marked = activeReplyId === mEventId && !suppressMark;
      const senderId = mEvent.getSender() ?? '';
      const senderName =
        getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={mEvent.getTs()}
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
          isMarked={marked}
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
            icon={timelineIcon(Code)}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <DecoratedUser userId={senderId} userName={senderName} room={room} />
                  {' sent '}
                  <code className={customHtmlCss.Code}>{mEvent.getType()}</code>
                  {' state event'}
                </Text>
              </Box>
            }
          />
        </Event>
      );
    },
    (mEventId, mEvent, item, timelineSet, collapse) => {
      if (!hiddenEventOther) return null;
      if (Object.keys(mEvent.getContent()).length === 0) return null;
      if (mEvent.getRelation()) return null;
      if (mEvent.isRedaction()) return null;

      const highlighted = focusItem?.index === item && focusItem.highlight;
      const marked = activeReplyId === mEventId && !suppressMark;
      const senderId = mEvent.getSender() ?? '';
      const senderName =
        getMemberDisplayName(room, senderId, nicknames) || getMxIdLocalPart(senderId);

      const timeJSX = (
        <Time
          ts={mEvent.getTs()}
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
          isMarked={marked}
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
            icon={timelineIcon(Code)}
            content={
              <Box grow="Yes" direction="Column">
                <Text size="T300" priority="300">
                  <b>{senderName}</b>
                  {' sent '}
                  <code className={customHtmlCss.Code}>{mEvent.getType()}</code>
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
