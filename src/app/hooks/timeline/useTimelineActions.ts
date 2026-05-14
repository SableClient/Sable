import type { MouseEventHandler } from 'react';
import { useCallback } from 'react';
import type { MatrixClient, Room, MatrixEvent, IContent } from '$types/matrix-sdk';
import type { UserProfile } from '$hooks/useUserProfile';
import { EventStatus } from '$types/matrix-sdk';
import type { Editor } from 'slate';
import { ReactEditor } from 'slate-react';

import { getMxIdLocalPart, toggleReaction } from '$utils/matrix';
import { getMemberDisplayName, getEditedEvent } from '$utils/room';
import { createMentionElement, moveCursor } from '$components/editor';
import * as prefix from '$unstable/prefixes';

export interface UseTimelineActionsOptions {
  room: Room;
  mx: MatrixClient;
  editor: Editor;
  nicknames: Record<string, string>;
  globalProfiles: Record<string, UserProfile>;
  spaceId?: string;
  openUserRoomProfile: (
    roomId: string,
    spaceId: string | undefined,
    userId: string,
    rect: DOMRect,
    undefinedArg?: undefined,
    options?: unknown
  ) => void;
  activeReplyId?: string;
  setReplyDraft: (draft: unknown) => void;
  openThreadId?: string;
  setOpenThread: (threadId: string | undefined) => void;
  handleEdit: (editId?: string) => void;
  handleOpenEvent: (eventId: string) => void;
}

export function useTimelineActions({
  room,
  mx,
  editor,
  nicknames,
  globalProfiles,
  spaceId,
  openUserRoomProfile,
  activeReplyId,
  setReplyDraft,
  openThreadId,
  setOpenThread,
  handleEdit,
  handleOpenEvent,
}: UseTimelineActionsOptions) {
  const handleOpenReply: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      const targetId = evt.currentTarget.getAttribute('data-event-id');
      if (!targetId) return;
      handleOpenEvent(targetId);
    },
    [handleOpenEvent]
  );

  const handleUserClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;

      const cachedData = globalProfiles[userId];
      const cleanExtended = cachedData?.extended ? { ...cachedData.extended } : undefined;

      if (cleanExtended) {
        delete cleanExtended[prefix.MATRIX_UNSTABLE_PROFILE_PRONOUNS_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_SABLE_UNSTABLE_PROFILE_BIOGRAPHY_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_BIO_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_COMMET_UNSTABLE_PROFILE_STATUS_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_UNSTABLE_PROFILE_TIMEZONE_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_STABLE_PROFILE_TIMEZONE_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_UNSTABLE_PROFILE_BANNER_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_DARK_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_SABLE_UNSTABLE_NAME_COLOR_LIGHT_PROPERTY_NAME];
        delete cleanExtended.avatar_url;
        delete cleanExtended.displayname;
        delete cleanExtended[prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_HAS_CAT_PROPERTY_NAME];
        delete cleanExtended[prefix.MATRIX_SABLE_UNSTABLE_ANIMAL_IDENTITY_IS_CAT_PROPERTY_NAME];
      }

      openUserRoomProfile(
        room.roomId,
        spaceId,
        userId,
        evt.currentTarget.getBoundingClientRect(),
        undefined,
        {
          pronouns: cachedData?.pronouns,
          bio: cachedData?.bio,
          timezone: cachedData?.timezone,
          extended: cleanExtended,
        }
      );
    },
    [room.roomId, spaceId, openUserRoomProfile, globalProfiles]
  );

  const handleUsernameClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;

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
    [mx, room, editor, nicknames]
  );

  const triggerReply = useCallback(
    (replyId: string, startThread = false) => {
      if (activeReplyId === replyId) {
        setReplyDraft(undefined);
        return;
      }

      const replyEvt = room.findEventById(replyId);
      if (!replyEvt) return;

      const editedReply = getEditedEvent(replyId, replyEvt, room.getUnfilteredTimelineSet());

      let editedNewContent: unknown;

      if (editedReply) {
        editedNewContent = editedReply.getContent()['m.new_content'];
      }

      const content: IContent = (editedNewContent ?? replyEvt.getContent()) as IContent;
      const { body, formatted_body: formattedBody } = content;

      const { 'm.relates_to': relation } = startThread
        ? { 'm.relates_to': { rel_type: 'm.thread', event_id: replyId } }
        : replyEvt.getWireContent();

      const senderId = replyEvt.getSender();

      if (senderId) {
        setReplyDraft({
          userId: senderId,
          eventId: replyId,
          body: typeof body === 'string' ? body : '',
          formattedBody: typeof formattedBody === 'string' ? formattedBody : '',
          relation,
        });
      }
    },
    [room, setReplyDraft, activeReplyId]
  );

  const handleReplyClick = useCallback(
    (evt: React.MouseEvent<HTMLButtonElement>, startThread = false) => {
      const replyId = evt.currentTarget.getAttribute('data-event-id');
      if (!replyId) {
        setReplyDraft(undefined);
        return;
      }
      if (startThread) {
        const rootEvent = room.findEventById(replyId);
        if (rootEvent && !room.getThread(replyId)) {
          room.createThread(replyId, rootEvent, [], false);
        }
        setOpenThread(openThreadId === replyId ? undefined : replyId);
        return;
      }
      triggerReply(replyId, false);
    },
    [triggerReply, setReplyDraft, setOpenThread, openThreadId, room]
  );

  const handleReactionToggle = useCallback(
    (targetEventId: string, key: string, shortcode?: string) => {
      toggleReaction(mx, room, targetEventId, key, shortcode);
    },
    [mx, room]
  );

  const handleResend = useCallback(
    (mEvent: MatrixEvent) => {
      if (mEvent.getAssociatedStatus() !== EventStatus.NOT_SENT) return;
      mx.resendEvent(mEvent, room).catch(() => undefined);
    },
    [mx, room]
  );

  const handleDeleteFailedSend = useCallback(
    (mEvent: MatrixEvent) => {
      if (mEvent.getAssociatedStatus() !== EventStatus.NOT_SENT) return;
      mx.cancelPendingEvent(mEvent);
    },
    [mx]
  );

  return {
    handleOpenReply,
    handleUserClick,
    handleUsernameClick,
    handleReplyClick,
    handleReactionToggle,
    handleResend,
    handleDeleteFailedSend,
    handleEdit,
    setOpenThread,
  };
}
