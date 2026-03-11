import { MouseEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { Box, Header, Icon, IconButton, Icons, Line, Scroll, Text, config } from 'folds';
import { MatrixEvent, ReceiptType, Room, RoomEvent } from '$types/matrix-sdk';
import { useAtomValue, useSetAtom } from 'jotai';
import { ReactEditor } from 'slate-react';
import { ImageContent, MSticker, RedactedContent } from '$components/message';
import { RenderMessageContent } from '$components/RenderMessageContent';
import { Image } from '$components/media';
import { ImageViewer } from '$components/image-viewer';
import { ClientSideHoverFreeze } from '$components/ClientSideHoverFreeze';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '$plugins/react-custom-html-parser';
import { getEditedEvent, getEventReactions, getMemberDisplayName } from '$utils/room';
import { getMxIdLocalPart, toggleReaction } from '$utils/matrix';
import { minuteDifference } from '$utils/time';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nicknamesAtom } from '$state/nicknames';
import { MessageLayout, MessageSpacing, settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { createMentionElement, moveCursor, useEditor } from '$components/editor';
import { useMentionClickHandler } from '$hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { GetContentCallback, MessageEvent, StateEvent } from '$types/matrix/room';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { IReplyDraft, roomIdToReplyDraftAtomFamily } from '$state/room/roomInputDrafts';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { EncryptedContent, Message, Reactions } from './message';
import { RoomInput } from './RoomInput';
import * as css from './ThreadDrawer.css';

type ThreadMessageProps = {
  room: Room;
  mEvent: MatrixEvent;
  editId: string | undefined;
  onEditId: (id?: string) => void;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  canDelete: boolean;
  canSendReaction: boolean;
  canPinEvent: boolean;
  imagePackRooms: Room[];
  activeReplyId: string | undefined;
  hour24Clock: boolean;
  dateFormatString: string;
  onUserClick: MouseEventHandler<HTMLButtonElement>;
  onUsernameClick: MouseEventHandler<HTMLButtonElement>;
  onReplyClick: (
    ev: Parameters<MouseEventHandler<HTMLButtonElement>>[0],
    startThread?: boolean
  ) => void;
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
  collapse?: boolean;
};

function ThreadMessage({
  room,
  mEvent,
  editId,
  onEditId,
  messageLayout,
  messageSpacing,
  canDelete,
  canSendReaction,
  collapse = false,
  canPinEvent,
  imagePackRooms,
  activeReplyId,
  hour24Clock,
  dateFormatString,
  onUserClick,
  onUsernameClick,
  onReplyClick,
  onReactionToggle,
}: ThreadMessageProps) {
  const mx = useMatrixClient();
  const timelineSet = room.getUnfilteredTimelineSet();
  const mEventId = mEvent.getId()!;
  const senderId = mEvent.getSender() ?? '';
  const nicknames = useAtomValue(nicknamesAtom);
  const senderDisplayName =
    getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;

  const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
  const editedNewContent = editedEvent?.getContent()['m.new_content'];
  const baseContent = mEvent.getContent();
  const safeContent =
    Object.keys(baseContent).length > 0 ? baseContent : mEvent.getOriginalContent();
  const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

  const reactionRelations = getEventReactions(timelineSet, mEventId);
  const reactions = reactionRelations?.getSortedAnnotationsByKey();
  const hasReactions = reactions && reactions.length > 0;

  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();
  const useAuthentication = useMediaAuthentication();
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [autoplayStickers] = useSetting(settingsAtom, 'autoplayStickers');

  return (
    <Message
      room={room}
      mEvent={mEvent}
      messageSpacing={messageSpacing}
      messageLayout={messageLayout}
      collapse={collapse}
      highlight={false}
      edit={editId === mEventId}
      canDelete={canDelete}
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
      senderDisplayName={senderDisplayName}
      activeReplyId={activeReplyId ?? null}
      hour24Clock={hour24Clock}
      dateFormatString={dateFormatString}
      reactions={
        hasReactions ? (
          <Reactions
            style={{ marginTop: config.space.S200 }}
            room={room}
            relations={reactionRelations!}
            mEventId={mEventId}
            canSendReaction={canSendReaction}
            canDeleteOwn={canDelete}
            onReactionToggle={onReactionToggle}
          />
        ) : undefined
      }
    >
      <EncryptedContent mEvent={mEvent}>
        {() => {
          if (mEvent.isRedacted())
            return (
              <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
            );

          if (mEvent.getType() === MessageEvent.Sticker)
            return (
              <MSticker
                content={mEvent.getContent()}
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

          return (
            <RenderMessageContent
              displayName={senderDisplayName}
              msgType={(editedNewContent ?? safeContent).msgtype ?? ''}
              ts={mEvent.getTs()}
              edited={!!editedEvent}
              getContent={getContent}
              mediaAutoLoad={mediaAutoLoad}
              urlPreview={urlPreview}
              htmlReactParserOptions={getReactCustomHtmlParser(mx, room.roomId, {
                linkifyOpts: {
                  ...LINKIFY_OPTS,
                  render: factoryRenderLinkifyWithMention((href) =>
                    renderMatrixMention(
                      mx,
                      room.roomId,
                      href,
                      makeMentionCustomProps(mentionClickHandler),
                      nicknames
                    )
                  ),
                },
                useAuthentication,
                handleSpoilerClick: spoilerClickHandler,
                handleMentionClick: mentionClickHandler,
                nicknames,
              })}
              linkifyOpts={{
                ...LINKIFY_OPTS,
                render: factoryRenderLinkifyWithMention((href) =>
                  renderMatrixMention(
                    mx,
                    room.roomId,
                    href,
                    makeMentionCustomProps(mentionClickHandler),
                    nicknames
                  )
                ),
              }}
              outlineAttachment={false}
            />
          );
        }}
      </EncryptedContent>
    </Message>
  );
}

type ThreadDrawerProps = {
  room: Room;
  threadRootId: string;
  onClose: () => void;
  overlay?: boolean;
};

export function ThreadDrawer({ room, threadRootId, onClose, overlay }: ThreadDrawerProps) {
  const mx = useMatrixClient();
  const drawerRef = useRef<HTMLDivElement>(null);
  const editor = useEditor();
  const [, forceUpdate] = useState(0);
  const [editId, setEditId] = useState<string | undefined>(undefined);

  // Settings
  const [messageLayout] = useSetting(settingsAtom, 'messageLayout');
  const [messageSpacing] = useSetting(settingsAtom, 'messageSpacing');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  // Power levels & permissions
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canRedact = permissions.action('redact', mx.getSafeUserId());
  const canDeleteOwn = permissions.event(MessageEvent.RoomRedaction, mx.getSafeUserId());
  const canSendReaction = permissions.event(MessageEvent.Reaction, mx.getSafeUserId());
  const canPinEvent = permissions.stateEvent(StateEvent.RoomPinnedEvents, mx.getSafeUserId());

  // Image packs
  const roomToParents = useAtomValue(roomToParentsAtom);
  const imagePackRooms: Room[] = useImagePackRooms(room.roomId, roomToParents);

  // Reply draft (keyed by threadRootId to match RoomInput's draftKey logic)
  const setReplyDraft = useSetAtom(roomIdToReplyDraftAtomFamily(threadRootId));
  const replyDraft = useAtomValue(roomIdToReplyDraftAtomFamily(threadRootId));
  const activeReplyId = replyDraft?.eventId;

  // User profile popup
  const openUserRoomProfile = useOpenUserRoomProfile();

  const rootEvent = room.findEventById(threadRootId);

  // Re-render when new thread events arrive.
  useEffect(() => {
    const onTimeline = (mEvent: MatrixEvent) => {
      if (mEvent.threadRootId === threadRootId || mEvent.getId() === threadRootId) {
        forceUpdate((n) => n + 1);
      }
    };
    mx.on(RoomEvent.Timeline, onTimeline as any);
    return () => {
      mx.off(RoomEvent.Timeline, onTimeline as any);
    };
  }, [mx, threadRootId]);

  // Mark thread as read when viewing it
  useEffect(() => {
    const markThreadAsRead = async () => {
      const thread = room.getThread(threadRootId);
      if (!thread) return;

      const events = thread.events || [];
      if (events.length === 0) return;

      const lastEvent = events[events.length - 1];
      if (!lastEvent || lastEvent.isSending()) return;

      const userId = mx.getUserId();
      if (!userId) return;

      const readUpToId = thread.getEventReadUpTo(userId, false);
      const lastEventId = lastEvent.getId();

      // Only send receipt if we haven't already read up to the last event
      if (readUpToId !== lastEventId) {
        try {
          await mx.sendReadReceipt(lastEvent, ReceiptType.Read);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Failed to send thread read receipt:', err);
        }
      }
    };

    // Mark as read when opened and when new messages arrive
    markThreadAsRead();
  }, [mx, room, threadRootId, forceUpdate]);

  // Use the Thread object if available (authoritative source with full history).
  // Fall back to scanning the live room timeline for local echoes and the
  // window before the Thread object is registered by the SDK.
  const replyEvents: MatrixEvent[] = (() => {
    const thread = room.getThread(threadRootId);
    const fromThread = thread?.events ?? [];
    if (fromThread.length > 0) {
      return fromThread.filter((ev) => ev.getId() !== threadRootId);
    }
    return room
      .getUnfilteredTimelineSet()
      .getLiveTimeline()
      .getEvents()
      .filter((ev) => ev.threadRootId === threadRootId && ev.getId() !== threadRootId);
  })();

  const handleUserClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;
      openUserRoomProfile(
        room.roomId,
        undefined,
        userId,
        evt.currentTarget.getBoundingClientRect()
      );
    },
    [room, openUserRoomProfile]
  );

  const handleUsernameClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;
      const nicknames = undefined; // will be resolved via getMemberDisplayName in editor
      const name =
        getMemberDisplayName(room, userId, nicknames) ?? getMxIdLocalPart(userId) ?? userId;
      editor.insertNode(
        createMentionElement(
          userId,
          name.startsWith('@') ? name : `@${name}`,
          userId === mx.getUserId()
        )
      );
      ReactEditor.focus(editor);
      moveCursor(editor);
    },
    [mx, room, editor]
  );

  const handleReplyClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const replyId = evt.currentTarget.getAttribute('data-event-id');
      if (!replyId) {
        setReplyDraft(undefined);
        return;
      }
      const replyEvt = room.findEventById(replyId);
      if (!replyEvt) return;
      const editedReply = getEditedEvent(replyId, replyEvt, room.getUnfilteredTimelineSet());
      const content = editedReply?.getContent()['m.new_content'] ?? replyEvt.getContent();
      const { body, formatted_body: formattedBody } = content;
      const senderId = replyEvt.getSender();
      if (senderId) {
        const draft: IReplyDraft = {
          userId: senderId,
          eventId: replyId,
          body: typeof body === 'string' ? body : '',
          formattedBody,
        };
        setReplyDraft(activeReplyId === replyId ? undefined : draft);
      }
    },
    [room, setReplyDraft, activeReplyId]
  );

  const handleReactionToggle = useCallback(
    (targetEventId: string, key: string, shortcode?: string) =>
      toggleReaction(mx, room, targetEventId, key, shortcode),
    [mx, room]
  );

  const handleEdit = useCallback(
    (evtId?: string) => {
      setEditId(evtId);
      if (!evtId) {
        ReactEditor.focus(editor);
        moveCursor(editor);
      }
    },
    [editor]
  );

  const sharedMessageProps = {
    room,
    editId,
    onEditId: handleEdit,
    messageLayout,
    messageSpacing,
    canDelete: canRedact || canDeleteOwn,
    canSendReaction,
    canPinEvent,
    imagePackRooms,
    activeReplyId,
    hour24Clock,
    dateFormatString,
    onUserClick: handleUserClick,
    onUsernameClick: handleUsernameClick,
    onReplyClick: handleReplyClick,
    onReactionToggle: handleReactionToggle,
  };

  return (
    <Box
      ref={drawerRef}
      className={overlay ? css.ThreadDrawerOverlay : css.ThreadDrawer}
      direction="Column"
      shrink="No"
    >
      {/* Header */}
      <Header className={css.ThreadDrawerHeader} variant="Background" size="400">
        <Box grow="Yes" alignItems="Center" gap="200">
          <Icon size="200" src={Icons.Thread} />
          <Text size="H4" truncate>
            Thread
          </Text>
        </Box>
        <Box alignItems="Center" gap="200" shrink="No">
          <Text size="T300" priority="300" truncate>
            # {room.name}
          </Text>
          <IconButton
            onClick={onClose}
            variant="SurfaceVariant"
            size="300"
            radii="300"
            aria-label="Close thread"
          >
            <Icon size="200" src={Icons.Cross} />
          </IconButton>
        </Box>
      </Header>

      <Line variant="Background" direction="Horizontal" size="300" />

      {/* Thread root message */}
      {rootEvent && (
        <Box direction="Column" style={{ padding: `${config.space.S200} ${config.space.S300}` }}>
          <ThreadMessage {...sharedMessageProps} mEvent={rootEvent} />
        </Box>
      )}

      <Line variant="Background" direction="Horizontal" size="300" />

      {/* Reply count label */}
      {replyEvents.length > 0 && (
        <Box style={{ padding: `${config.space.S100} ${config.space.S300}` }}>
          <Text size="T300" priority="300">
            {replyEvents.length} {replyEvents.length === 1 ? 'reply' : 'replies'}
          </Text>
        </Box>
      )}

      {/* Replies */}
      <Box className={css.ThreadDrawerContent} grow="Yes" direction="Column">
        <Scroll
          ref={undefined}
          variant="Background"
          visibility="Hover"
          direction="Vertical"
          hideTrack
          style={{ flexGrow: 1 }}
        >
          {replyEvents.length === 0 ? (
            <Box
              direction="Column"
              alignItems="Center"
              justifyContent="Center"
              style={{ padding: config.space.S400, gap: config.space.S200 }}
            >
              <Icon size="400" src={Icons.Thread} />
              <Text size="T300" align="Center">
                No replies yet. Start the thread below!
              </Text>
            </Box>
          ) : (
            <Box direction="Column" style={{ padding: `${config.space.S200} 0` }}>
              {replyEvents.map((mEvent, i) => {
                const prevEvent = i > 0 ? replyEvents[i - 1] : undefined;
                const collapse =
                  prevEvent !== undefined &&
                  prevEvent.getSender() === mEvent.getSender() &&
                  prevEvent.getType() === mEvent.getType() &&
                  minuteDifference(prevEvent.getTs(), mEvent.getTs()) < 2;
                return (
                  <ThreadMessage
                    key={mEvent.getId()}
                    {...sharedMessageProps}
                    mEvent={mEvent}
                    collapse={collapse}
                  />
                );
              })}
            </Box>
          )}
        </Scroll>
      </Box>

      {/* Thread input */}
      <Box className={css.ThreadDrawerInput} direction="Column" shrink="No">
        <div style={{ padding: `0 ${config.space.S200}` }}>
          <RoomInput
            key={threadRootId}
            room={room}
            roomId={room.roomId}
            threadRootId={threadRootId}
            editor={editor}
            fileDropContainerRef={drawerRef}
          />
        </div>
      </Box>
    </Box>
  );
}
