import { useCallback, MouseEventHandler } from 'react';
import { MatrixClient, Room, MatrixEvent, EventStatus, IContent } from '$types/matrix-sdk';
import { Editor } from 'slate';
import { ReactEditor } from 'slate-react';

import { getMxIdLocalPart, toggleReaction } from '$utils/matrix';
import { getMemberDisplayName, getEditedEvent } from '$utils/room';
import { createMentionElement, isEmptyEditor, moveCursor } from '$components/editor';

export interface UseTimelineActionsOptions {
  room: Room;
  mx: MatrixClient;
  editor: Editor;
  alive: () => boolean;
  nicknames: Record<string, string>;
  globalProfiles: Record<string, any>;
  spaceId?: string;
  openUserRoomProfile: (
    roomId: string,
    spaceId: string | undefined,
    userId: string,
    rect: DOMRect,
    undefinedArg?: undefined,
    options?: any
  ) => void;
  activeReplyId?: string;
  setReplyDraft: (draft: any) => void;
  openThreadId?: string;
  setOpenThread: (threadId: string | undefined) => void;
  setEditId: (editId: string | undefined) => void;
  onEditorReset?: () => void;
  handleOpenEvent: (eventId: string) => void;
}

export function useTimelineActions({
  room,
  mx,
  editor,
  alive,
  nicknames,
  globalProfiles,
  spaceId,
  openUserRoomProfile,
  activeReplyId,
  setReplyDraft,
  openThreadId,
  setOpenThread,
  setEditId,
  onEditorReset,
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
        delete cleanExtended['io.fsky.nyx.pronouns'];
        delete cleanExtended['moe.sable.app.bio'];
        delete cleanExtended['chat.commet.profile_bio'];
        delete cleanExtended['chat.commet.profile_status'];
        delete cleanExtended['us.cloke.msc4175.tz'];
        delete cleanExtended['m.tz'];
        delete cleanExtended['chat.commet.profile_banner'];
        delete cleanExtended['moe.sable.app.name_color'];
        delete cleanExtended.avatar_url;
        delete cleanExtended.displayname;
        delete cleanExtended['kitty.meow.has_cats'];
        delete cleanExtended['kitty.meow.is_cat'];
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

      const { getContent, getWireContent, getSender } = replyEvt;
      let editedNewContent: any;

      if (editedReply) {
        const { getContent: getEditedContent } = editedReply;
        editedNewContent = getEditedContent.call(editedReply)['m.new_content'];
      }

      const content: IContent = editedNewContent ?? getContent.call(replyEvt);
      const { body, formatted_body: formattedBody } = content;

      const { 'm.relates_to': relation } = startThread
        ? { 'm.relates_to': { rel_type: 'm.thread', event_id: replyId } }
        : getWireContent.call(replyEvt);

      const senderId = getSender.call(replyEvt);

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
      const { getAssociatedStatus } = mEvent;
      if (getAssociatedStatus.call(mEvent) !== EventStatus.NOT_SENT) return;
      mx.resendEvent(mEvent, room).catch(() => undefined);
    },
    [mx, room]
  );

  const handleDeleteFailedSend = useCallback(
    (mEvent: MatrixEvent) => {
      const { getAssociatedStatus } = mEvent;
      if (getAssociatedStatus.call(mEvent) !== EventStatus.NOT_SENT) return;
      mx.cancelPendingEvent(mEvent);
    },
    [mx]
  );

  const handleEdit = useCallback(
    (targetEditId?: string) => {
      if (targetEditId) {
        setEditId(targetEditId);
        return;
      }
      setEditId(undefined);

      requestAnimationFrame(() => {
        if (!alive()) return;
        if (isEmptyEditor(editor)) onEditorReset?.();
        ReactEditor.focus(editor);
        moveCursor(editor);
      });
    },
    [editor, alive, onEditorReset, setEditId]
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
