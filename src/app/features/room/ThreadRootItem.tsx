import type { MouseEventHandler } from 'react';
import { Box, Scroll, config } from 'folds';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { EventType } from 'matrix-js-sdk';
import type { Thread } from 'matrix-js-sdk/lib/models/thread';
import { useAtomValue } from 'jotai';
import type { HTMLReactParserOptions } from 'html-react-parser';
import type { Opts as LinkifyOpts } from 'linkifyjs';
import { Image } from '$components/media';
import { ImageViewer } from '$components/image-viewer';
import { getEditedEvent, getEventReactions, getMemberDisplayName } from '$utils/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { ImageContent, MSticker, RedactedContent, Reply } from '$components/message';
import { RenderMessageContent } from '$components/RenderMessageContent';
import type { MessageLayout, MessageSpacing } from '$state/settings';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import type { GetContentCallback } from '$types/matrix/room';
import { nicknamesAtom } from '$state/nicknames';
import { EncryptedContent, Message, Reactions } from './message';

export type ThreadRootItemProps = {
  room: Room;
  mEvent: MatrixEvent;
  thread?: Thread;
  editId: string | undefined;
  onEditId: (id?: string) => void;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  canDelete: boolean;
  canSendReaction: boolean;
  canPinEvent: boolean;
  imagePackRooms: Room[];
  hour24Clock: boolean;
  dateFormatString: string;
  onUserClick: MouseEventHandler<HTMLButtonElement>;
  onUsernameClick: MouseEventHandler<HTMLButtonElement>;
  onReplyClick: MouseEventHandler<HTMLButtonElement>;
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
  linkifyOpts: LinkifyOpts;
  htmlReactParserOptions: HTMLReactParserOptions;
  showHideReads: boolean;
  showDeveloperTools: boolean;
  onReferenceClick: MouseEventHandler<HTMLButtonElement>;
  hideReplyButton?: boolean;
};

export function ThreadRootItem({
  room,
  mEvent,
  thread,
  editId,
  onEditId,
  messageLayout,
  messageSpacing,
  canDelete,
  canSendReaction,
  canPinEvent,
  imagePackRooms,
  hour24Clock,
  dateFormatString,
  onUserClick,
  onUsernameClick,
  onReplyClick,
  onReactionToggle,
  linkifyOpts,
  htmlReactParserOptions,
  showHideReads,
  showDeveloperTools,
  onReferenceClick,
  hideReplyButton,
}: ThreadRootItemProps) {
  const nicknames = useAtomValue(nicknamesAtom);
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');

  const mEventId = mEvent.getId();
  if (!mEventId) return null;

  const senderId = mEvent.getSender() ?? '';
  const senderDisplayName =
    getMemberDisplayName(room, senderId, nicknames) ?? getMxIdLocalPart(senderId) ?? senderId;

  const timelineSet = thread?.timelineSet ?? room.getUnfilteredTimelineSet();
  const editedEvent = getEditedEvent(mEventId, mEvent, timelineSet);
  const editedNewContent = editedEvent?.getContent()['m.new_content'];
  const baseContent = mEvent.getContent();
  const safeContent =
    Object.keys(baseContent).length > 0 ? baseContent : mEvent.getOriginalContent();
  const getContent = (() => editedNewContent ?? safeContent) as GetContentCallback;

  const reactionRelations = getEventReactions(timelineSet, mEventId);
  const reactions = reactionRelations?.getSortedAnnotationsByKey();
  const hasReactions = reactions && reactions.length > 0;

  const { replyEventId } = mEvent;
  const showUrlPreview = room.hasEncryptionStateEvent() ? false : urlPreview;

  return (
    <>
      <Message
        data-message-id={mEventId}
        room={room}
        mEvent={mEvent}
        senderId={senderId}
        senderDisplayName={senderDisplayName}
        messageSpacing={messageSpacing}
        messageLayout={messageLayout}
        collapse={false}
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
        hour24Clock={hour24Clock}
        dateFormatString={dateFormatString}
        hideReadReceipts={showHideReads}
        hideReplyButton={hideReplyButton}
        showDeveloperTools={showDeveloperTools}
        reply={
          replyEventId && (
            <Reply
              room={room}
              timelineSet={timelineSet}
              replyEventId={replyEventId}
              onClick={onReferenceClick}
            />
          )
        }
      >
        {mEvent.isRedacted() ? (
          <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />
        ) : (
          <Scroll
            variant="Background"
            visibility="Hover"
            direction="Vertical"
            hideTrack={false}
            style={{
              maxHeight: '200px',
              flexShrink: 0,
              height: 'auto',
            }}
          >
            <EncryptedContent mEvent={mEvent}>
              {() => {
                if (mEvent.isRedacted()) {
                  return (
                    <RedactedContent
                      reason={mEvent.getUnsigned().redacted_because?.content.reason}
                    />
                  );
                }

                if (mEvent.getType() === (EventType.Sticker as string)) {
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
                }

                return (
                  <RenderMessageContent
                    displayName={senderDisplayName}
                    msgType={(editedNewContent ?? safeContent).msgtype ?? ''}
                    ts={mEvent.getTs()}
                    edited={!!editedEvent}
                    getContent={getContent}
                    mediaAutoLoad={mediaAutoLoad}
                    urlPreview={showUrlPreview}
                    htmlReactParserOptions={htmlReactParserOptions}
                    linkifyOpts={linkifyOpts}
                    outlineAttachment
                  />
                );
              }}
            </EncryptedContent>
          </Scroll>
        )}
      </Message>

      {/* Reactions — outside scroll so always visible */}
      {hasReactions && reactionRelations && (
        <Box style={{ paddingLeft: config.space.S700 }}>
          <Reactions
            style={{ marginTop: config.space.S200 }}
            room={room}
            relations={reactionRelations}
            mEventId={mEventId}
            canSendReaction={canSendReaction}
            canDeleteOwn={canDelete}
            onReactionToggle={onReactionToggle}
          />
        </Box>
      )}
    </>
  );
}
