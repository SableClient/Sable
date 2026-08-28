import type { MouseEventHandler } from 'react';
import { useCallback } from 'react';
import type { MatrixClient, Room, MatrixEvent } from '$types/matrix-sdk';
import type { UserProfile } from '$hooks/useUserProfile';
import { EventStatus, RelationType } from '$types/matrix-sdk';

import { getMxIdLocalPart, toggleReaction } from '$utils/matrix';
import { getMemberDisplayName } from '$utils/room/display';
import { extractReplyDraftBody, resolveReplyDraftTarget } from '$utils/room/relations';
import { createMentionElement } from '$components/editor';
import type { ProseMirrorEditorController } from '$components/editor/prosemirrorController';
import * as prefix from '$unstable/prefixes';
import type { Persona } from '$hooks/usePerMessageProfile';
import { convertBeeperFormatToOurPerMessageProfile } from '$hooks/usePerMessageProfile';

/**
 * The profile popup reads name, avatar and the identity fields off the room
 * member, so the cached copies would shadow fresher state event data.
 */
export const buildCachedProfilePayload = (cachedData: UserProfile | undefined) => {
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

  return {
    pronouns: cachedData?.pronouns,
    bio: cachedData?.bio,
    timezone: cachedData?.timezone,
    extended: cleanExtended,
  };
};

export interface UseTimelineActionsOptions {
  room: Room;
  mx: MatrixClient;
  editor: ProseMirrorEditorController;
  nicknames: Record<string, string>;
  getGlobalProfile: (userId: string) => UserProfile | undefined;
  spaceId?: string;
  openUserRoomProfile: (
    roomId: string,
    spaceId: string | undefined,
    userId: string,
    pmp: Persona | undefined,
    rect: DOMRect,
    undefinedArg?: undefined,
    options?: unknown
  ) => void;
  activeReplyId?: string;
  /** Distinguishes a real reply draft from the seeded base-thread draft, which has body ''. */
  activeReplyBody?: string;
  setReplyDraft: (draft: unknown) => void;
  /** Set when these actions drive a thread drawer rather than the room timeline. */
  threadRootId?: string;
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
  getGlobalProfile,
  spaceId,
  openUserRoomProfile,
  activeReplyId,
  activeReplyBody,
  setReplyDraft,
  threadRootId,
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

      const messageId = evt.currentTarget.getAttribute('data-parent-message-id');
      let perMessageProfile;
      if (messageId) {
        const pmp = room.findEventById(messageId)?.getContent()[
          prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME
        ];
        if (pmp) {
          perMessageProfile = convertBeeperFormatToOurPerMessageProfile(pmp);
        }
      }

      openUserRoomProfile(
        room.roomId,
        spaceId,
        userId,
        perMessageProfile,
        evt.currentTarget.getBoundingClientRect(),
        undefined,
        buildCachedProfilePayload(getGlobalProfile(userId))
      );
    },
    [room, spaceId, openUserRoomProfile, getGlobalProfile]
  );

  const handleUsernameClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    (evt) => {
      evt.preventDefault();
      const userId = evt.currentTarget.getAttribute('data-user-id');
      if (!userId) return;

      const name =
        getMemberDisplayName(room, userId, nicknames) ?? getMxIdLocalPart(userId) ?? userId;

      editor.insertInline(
        createMentionElement(
          userId,
          name.startsWith('@') ? name : `@${name}`,
          userId === mx.getUserId()
        )
      );
      editor.insertText(' ');
      editor.focus();
    },
    [mx, room, editor, nicknames]
  );

  const triggerReply = useCallback(
    (replyId: string, startThread = false) => {
      const resolved = resolveReplyDraftTarget(room, replyId);
      if (!resolved) return;

      const { eventId: draftEventId, replyEvt } = resolved;

      // In a thread the seeded base draft already targets the root with an empty
      // body, so matching on the id alone would make the root unrepliable.
      if (activeReplyId === draftEventId && activeReplyBody !== '') {
        setReplyDraft(
          threadRootId
            ? {
                userId: mx.getUserId() ?? '',
                eventId: threadRootId,
                body: '',
                relation: { rel_type: RelationType.Thread, event_id: threadRootId },
              }
            : undefined
        );
        return;
      }

      const timelineSet = room.getUnfilteredTimelineSet();
      const { body, formattedBody } = extractReplyDraftBody(replyEvt, timelineSet);

      const { 'm.relates_to': relation } = startThread
        ? { 'm.relates_to': { rel_type: RelationType.Thread, event_id: draftEventId } }
        : replyEvt.getWireContent();

      const senderId = replyEvt.getSender();

      if (senderId) {
        setReplyDraft({
          userId: senderId,
          eventId: draftEventId,
          body,
          formattedBody,
          relation,
        });
      }
    },
    [room, setReplyDraft, activeReplyId, activeReplyBody, threadRootId, mx]
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
      // Thread reactions live in the thread's own timeline set; without it the
      // existing reaction is never found and un-reacting sends a second one.
      const threadTimelineSet = threadRootId
        ? room.getThread(threadRootId)?.timelineSet
        : undefined;
      toggleReaction(mx, room, targetEventId, key, shortcode, threadTimelineSet);
    },
    [mx, room, threadRootId]
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
