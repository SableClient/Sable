import type {
  EventTimelineSet,
  EventTimeline,
  IMentions,
  IThreadBundledRelationship,
  MatrixClient,
  MatrixEvent,
  Room,
} from '$types/matrix-sdk';
import { EventType, KnownMembership, MsgType, RelationType } from '$types/matrix-sdk';

// Local copy to avoid circular dependency with display.ts (which imports from $utils/matrix)
const trimReplyFromBodyLocal = (body: string): string => {
  const match = body.match(/^> <.+?> .+\n(>.*\n)*?\n/m);
  if (!match) return body;
  return body.slice(match[0].length);
};

export const isMembershipChanged = (mEvent: MatrixEvent): boolean =>
  mEvent.getContent().membership !== mEvent.getPrevContent().membership ||
  mEvent.getContent().reason !== mEvent.getPrevContent().reason;

export const getEventReactions = (timelineSet: EventTimelineSet, eventId: string) =>
  timelineSet.relations.getChildEventsForEvent(
    eventId,
    RelationType.Annotation,
    EventType.Reaction
  );

export const getEventEdits = (timelineSet: EventTimelineSet, eventId: string, eventType: string) =>
  timelineSet.relations.getChildEventsForEvent(eventId, RelationType.Replace, eventType);

const getLatestEdit = (
  targetEvent: MatrixEvent,
  editEvents: MatrixEvent[]
): MatrixEvent | undefined => {
  const eventByTargetSender = (rEvent: MatrixEvent) =>
    rEvent.getSender() === targetEvent.getSender();
  return editEvents.toSorted((m1, m2) => m2.getTs() - m1.getTs()).find(eventByTargetSender);
};

export const getEditedEvent = (
  mEventId: string,
  mEvent: MatrixEvent,
  timelineSet: EventTimelineSet
): MatrixEvent | undefined => {
  const edits = getEventEdits(timelineSet, mEventId, mEvent.getType());
  return edits && getLatestEdit(mEvent, edits.getRelations());
};

export const isEditEvent = (mEvent: MatrixEvent): boolean => {
  const relType = mEvent.getRelation()?.rel_type;
  if (relType === (RelationType.Replace as string)) return true;
  if (mEvent.getContent()['m.new_content'] !== undefined) return true;
  return false;
};

export const isReactionEvent = (mEvent: MatrixEvent): boolean =>
  mEvent.getType() === (EventType.Reaction as string);

const FORWARDABLE_EVENT_TYPES = new Set<string>([
  EventType.RoomMessage as string,
  EventType.RoomMessageEncrypted as string,
  EventType.Sticker as string,
]);

export const canForwardEvent = (mEvent: MatrixEvent): boolean => {
  if (mEvent.isRedacted()) return false;
  if (isEditEvent(mEvent)) return false;
  if (mEvent.getType() === (EventType.RoomRedaction as string)) return false;
  if (isReactionEvent(mEvent)) return false;
  if (typeof mEvent.getStateKey() === 'string') return false;
  if (mEvent.isRedaction()) return false;
  return FORWARDABLE_EVENT_TYPES.has(mEvent.getType());
};

export const getReactionKey = (mEvent: MatrixEvent): string | undefined => {
  const key = mEvent.getRelation()?.key;
  if (typeof key === 'string' && key.length > 0) return key;

  const contentRelatesTo = mEvent.getContent()['m.relates_to'] as { key?: string } | undefined;
  if (typeof contentRelatesTo?.key === 'string' && contentRelatesTo.key.length > 0) {
    return contentRelatesTo.key;
  }

  const originalRelatesTo = mEvent.getOriginalContent?.()?.['m.relates_to'] as
    | { key?: string }
    | undefined;
  if (typeof originalRelatesTo?.key === 'string' && originalRelatesTo.key.length > 0) {
    return originalRelatesTo.key;
  }

  return undefined;
};

const readReactionShortcode = (
  content: Record<string, unknown> | undefined
): string | undefined => {
  if (!content) return undefined;
  const shortcode = content.shortcode ?? content['com.beeper.reaction.shortcode'];
  return typeof shortcode === 'string' && shortcode.length > 0 ? shortcode : undefined;
};

export const getReactionShortcode = (mEvent: MatrixEvent): string | undefined =>
  readReactionShortcode(mEvent.getContent()) ??
  readReactionShortcode(mEvent.getOriginalContent?.());

export const getReactionAnnotationTargetId = (reactionEvent: MatrixEvent): string | undefined => {
  const eventId = reactionEvent.getRelation()?.event_id;
  if (typeof eventId === 'string' && eventId.length > 0) return eventId;

  const contentRelatesTo = reactionEvent.getContent()['m.relates_to'] as
    | { event_id?: string }
    | undefined;
  if (typeof contentRelatesTo?.event_id === 'string' && contentRelatesTo.event_id.length > 0) {
    return contentRelatesTo.event_id;
  }

  const originalRelatesTo = reactionEvent.getOriginalContent?.()?.['m.relates_to'] as
    | { event_id?: string }
    | undefined;
  if (typeof originalRelatesTo?.event_id === 'string' && originalRelatesTo.event_id.length > 0) {
    return originalRelatesTo.event_id;
  }

  return undefined;
};

export const getRedactionReason = (mEvent: MatrixEvent): string | undefined => {
  const reason = mEvent.getUnsigned()?.redacted_because?.content?.reason;
  return typeof reason === 'string' && reason.length > 0 ? reason : undefined;
};

export const collectRelationReactionEvents = (
  linkedTimelines: EventTimeline[],
  existingIds: ReadonlySet<string>,
  ignoredUsersSet: Set<string>,
  showReactions: boolean,
  showReactionTombstones: boolean
): { mEvent: MatrixEvent; timelineSet: EventTimelineSet; parentId: string }[] => {
  if (!showReactions && !showReactionTombstones) return [];

  const extras: { mEvent: MatrixEvent; timelineSet: EventTimelineSet; parentId: string }[] = [];
  const seen = new Set(existingIds);

  for (const timeline of linkedTimelines) {
    const timelineSet = timeline.getTimelineSet();
    for (const parent of timeline.getEvents()) {
      const parentId = parent.getId();
      if (!parentId) continue;

      const reactions = getEventReactions(timelineSet, parentId);
      if (!reactions) continue;

      for (const reaction of reactions.getRelations()) {
        const reactionId = reaction.getId();
        if (!reactionId || seen.has(reactionId)) continue;
        seen.add(reactionId);

        const sender = reaction.getSender();
        if (sender && ignoredUsersSet.has(sender)) continue;

        const redacted = reaction.isRedacted();
        if (redacted && !showReactionTombstones) continue;
        if (!redacted && !showReactions) continue;

        extras.push({ mEvent: reaction, timelineSet, parentId });
      }
    }
  }

  return extras;
};

export const collectRelationEditEvents = (
  linkedTimelines: EventTimeline[],
  existingIds: ReadonlySet<string>,
  ignoredUsersSet: Set<string>,
  showEdits: boolean
): { mEvent: MatrixEvent; timelineSet: EventTimelineSet; parentId: string }[] => {
  if (!showEdits) return [];

  const extras: { mEvent: MatrixEvent; timelineSet: EventTimelineSet; parentId: string }[] = [];
  const seen = new Set(existingIds);

  for (const timeline of linkedTimelines) {
    const timelineSet = timeline.getTimelineSet();
    for (const parent of timeline.getEvents()) {
      const parentId = parent.getId();
      if (!parentId || isEditEvent(parent)) continue;

      const edits = getEventEdits(timelineSet, parentId, parent.getType());
      if (!edits) continue;

      for (const editEvent of edits.getRelations()) {
        const editId = editEvent.getId();
        if (!editId || seen.has(editId)) continue;
        seen.add(editId);

        const sender = editEvent.getSender();
        if (sender && ignoredUsersSet.has(sender)) continue;

        extras.push({ mEvent: editEvent, timelineSet, parentId });
      }
    }
  }

  return extras;
};

export const isRedactableMessageType = (type: string): boolean =>
  type === (EventType.RoomMessage as string) ||
  type === (EventType.RoomMessageEncrypted as string) ||
  type === (EventType.Sticker as string);

export const getRedactionTargetId = (redactionEvent: MatrixEvent): string | undefined => {
  const redacts = redactionEvent.event?.redacts;
  if (typeof redacts === 'string') return redacts;
  const associated = redactionEvent.getAssociatedId?.();
  return typeof associated === 'string' ? associated : undefined;
};

export const getRedactionTargetEvent = (
  timelineSet: EventTimelineSet,
  redactionEvent: MatrixEvent
): MatrixEvent | undefined => {
  const targetId = getRedactionTargetId(redactionEvent);
  if (!targetId) return undefined;
  return timelineSet.findEventById(targetId);
};

export const shouldShowRedactionTimelineEvent = (
  mEvent: MatrixEvent,
  timelineSet: EventTimelineSet,
  hiddenEventRedactionTimeline: boolean,
  hiddenEventReactionRedactionTimeline: boolean
): boolean => {
  if (!mEvent.isRedaction()) return false;
  const target = getRedactionTargetEvent(timelineSet, mEvent);
  if (target?.getType() === (EventType.Reaction as string)) {
    return hiddenEventReactionRedactionTimeline;
  }
  return hiddenEventRedactionTimeline;
};

const readReplaceTargetId = (
  relatesTo: { rel_type?: string; event_id?: string } | undefined
): string | undefined => {
  if (relatesTo?.rel_type !== (RelationType.Replace as string)) return undefined;
  const eventId = relatesTo.event_id;
  return typeof eventId === 'string' && eventId.length > 0 ? eventId : undefined;
};

export const getEditTargetId = (editEvent: MatrixEvent): string | undefined => {
  const relationEventId = editEvent.getRelation()?.event_id;
  if (typeof relationEventId === 'string' && relationEventId.length > 0) {
    return relationEventId;
  }

  const content = editEvent.getContent();
  const fromContent = readReplaceTargetId(
    content['m.relates_to'] as { rel_type?: string; event_id?: string } | undefined
  );
  if (fromContent) return fromContent;

  const wireContent = editEvent.getWireContent?.() as Record<string, unknown> | undefined;
  const fromWire = readReplaceTargetId(
    wireContent?.['m.relates_to'] as { rel_type?: string; event_id?: string } | undefined
  );
  if (fromWire) return fromWire;

  return readReplaceTargetId(
    editEvent.getOriginalContent?.()?.['m.relates_to'] as
      | { rel_type?: string; event_id?: string }
      | undefined
  );
};

export const getEditChain = (
  timelineSet: EventTimelineSet,
  eventId: string,
  eventType: string,
  room?: Room
): { original: MatrixEvent; edits: MatrixEvent[] } | undefined => {
  let original = timelineSet.findEventById(eventId);
  if (!original && room) {
    original = room.findEventById(eventId) ?? undefined;
  }
  if (!original) return undefined;

  const editsRelation = getEventEdits(timelineSet, eventId, original.getType() ?? eventType);
  const edits = editsRelation
    ? [...editsRelation.getRelations()].toSorted((a, b) => a.getTs() - b.getTs())
    : [];
  return { original, edits };
};

const getEditChainEvents = (
  currentEditEvent: MatrixEvent,
  chain: { original: MatrixEvent; edits: MatrixEvent[] }
): MatrixEvent[] => {
  const currentId = currentEditEvent.getId();
  const edits =
    currentId && !chain.edits.some((editEvent) => editEvent.getId() === currentId)
      ? [...chain.edits, currentEditEvent].toSorted((a, b) => a.getTs() - b.getTs())
      : chain.edits;
  return [chain.original, ...edits];
};

export const getPreviousEditId = (
  currentEditEvent: MatrixEvent,
  chain: { original: MatrixEvent; edits: MatrixEvent[] }
): string | undefined => {
  const currentId = currentEditEvent.getId();
  if (!currentId) return undefined;

  const allEvents = getEditChainEvents(currentEditEvent, chain);
  const idx = allEvents.findIndex((e) => e.getId() === currentId);
  if (idx <= 0) return undefined;
  return allEvents[idx - 1]?.getId();
};

const getPreviousEditEvent = (
  currentEditEvent: MatrixEvent,
  chain: { original: MatrixEvent; edits: MatrixEvent[] }
): MatrixEvent | undefined => {
  const currentId = currentEditEvent.getId();
  if (!currentId) return undefined;

  const allEvents = getEditChainEvents(currentEditEvent, chain);
  const idx = allEvents.findIndex((e) => e.getId() === currentId);
  if (idx <= 0) return undefined;
  return allEvents[idx - 1];
};

const EDIT_DIFF_MSGTYPES = new Set<string>([MsgType.Text, MsgType.Emote, MsgType.Notice]);

const getMessageVersionBody = (mEvent: MatrixEvent): string | undefined => {
  const content = mEvent.getContent();
  const wireContent = mEvent.getWireContent?.() as Record<string, unknown> | undefined;

  let versionContent: Record<string, unknown> | undefined;
  if (isEditEvent(mEvent)) {
    versionContent =
      (content['m.new_content'] as Record<string, unknown> | undefined) ??
      (wireContent?.['m.new_content'] as Record<string, unknown> | undefined);
  } else {
    versionContent =
      (mEvent.getOriginalContent?.() as Record<string, unknown> | undefined) ??
      (content as Record<string, unknown>);
  }

  const fallbackContent =
    (!versionContent || typeof versionContent.body !== 'string') && mEvent.getOriginalContent?.()
      ? (mEvent.getOriginalContent?.() as Record<string, unknown>)
      : undefined;
  const resolvedContent =
    versionContent && typeof versionContent === 'object' ? versionContent : fallbackContent;
  if (!resolvedContent || typeof resolvedContent !== 'object') return undefined;

  const msgtype = resolvedContent.msgtype;
  if (typeof msgtype === 'string' && !EDIT_DIFF_MSGTYPES.has(msgtype)) {
    return undefined;
  }

  const body = resolvedContent.body;
  return typeof body === 'string' ? trimReplyFromBodyLocal(body) : undefined;
};

export const getEditDiffBodies = (
  editEvent: MatrixEvent,
  timelineSet: EventTimelineSet,
  room?: Room
): { oldBody?: string; newBody?: string } => {
  const newBody = getMessageVersionBody(editEvent);
  const editTargetId = getEditTargetId(editEvent);
  if (!editTargetId) {
    return { newBody };
  }

  const chain = getEditChain(timelineSet, editTargetId, editEvent.getType(), room);
  let previousEvent = chain ? getPreviousEditEvent(editEvent, chain) : undefined;
  if (!previousEvent) {
    previousEvent =
      chain?.original ??
      timelineSet.findEventById(editTargetId) ??
      room?.findEventById(editTargetId);
  }

  const oldBody =
    previousEvent && previousEvent.getId() !== editEvent.getId()
      ? getMessageVersionBody(previousEvent)
      : undefined;

  return { oldBody, newBody };
};

export const canEditEvent = (mx: MatrixClient, mEvent: MatrixEvent) => {
  const content = mEvent.getContent();
  const relationType = content['m.relates_to']?.rel_type;
  return (
    mEvent.getSender() === mx.getUserId() &&
    mEvent.getType() === (EventType.RoomMessage as string) &&
    (!relationType || relationType === (RelationType.Thread as string)) &&
    (content.msgtype === MsgType.Text ||
      content.msgtype === MsgType.Emote ||
      content.msgtype === MsgType.Notice ||
      content.msgtype === MsgType.Image ||
      content.msgtype === MsgType.Video ||
      content.msgtype === MsgType.Audio ||
      content.msgtype === MsgType.File)
  );
};

export const reactionOrEditEvent = (mEvent: MatrixEvent): boolean => {
  const relType = mEvent.getRelation()?.rel_type;
  if (
    relType === (RelationType.Annotation as string) ||
    relType === (RelationType.Replace as string)
  )
    return true;

  // Sliding sync proxies may omit m.relates_to on the initial delivery of timeline
  // events.  Detect edit events by the presence of m.new_content in the event
  // content even when the relation metadata is absent, so they are filtered from
  // the rendered timeline rather than falling through as unsupported messages.
  if (mEvent.getContent()['m.new_content'] !== undefined) return true;

  return false;
};

export const isThreadRelationEvent = (mEvent: MatrixEvent, threadRootId?: string): boolean => {
  const relation =
    mEvent.getRelation?.() ??
    (
      mEvent.getWireContent?.() as {
        'm.relates_to'?: { rel_type?: unknown; event_id?: unknown };
      }
    )?.['m.relates_to'] ??
    (
      mEvent.getContent?.() as {
        'm.relates_to'?: { rel_type?: unknown; event_id?: unknown };
      }
    )?.['m.relates_to'];

  return (
    relation?.rel_type === (RelationType.Thread as string) &&
    (threadRootId === undefined || relation.event_id === threadRootId)
  );
};

export const hasThreadRootAggregation = (mEvent: MatrixEvent): boolean =>
  (mEvent.getServerAggregatedRelation?.<IThreadBundledRelationship>(RelationType.Thread as string)
    ?.count ?? 0) > 0;

/**
 * Resolve the list of reply events to show for a thread.
 *
 * Prefers events from the SDK Thread object (authoritative, full history) but
 * falls back to scanning the main room timeline when the Thread object was
 * created without `initialEvents` (as happens with classic sync).  In that
 * case `thread.events` contains only the root event, so filtering it yields an
 * empty array — we must fall back rather than showing nothing.
 */
export const getThreadReplyEvents = (room: Room, threadRootId: string): MatrixEvent[] => {
  const isReply = (ev: MatrixEvent) =>
    ev.getId() !== threadRootId &&
    !reactionOrEditEvent(ev) &&
    isThreadRelationEvent(ev, threadRootId);

  const thread = room.getThread(threadRootId);
  const fromThread = (thread?.events ?? []).filter(isReply);
  if (fromThread.length > 0) return fromThread;

  return room.getUnfilteredTimelineSet().getLiveTimeline().getEvents().filter(isReply);
};

/**
 * Timeline rows skip reactions, edits, and other relation-only events.  When jumping
 * to a reply target, unwrap to the event that is actually rendered (root of an
 * edit chain, message for a reaction annotation, etc.).
 */
export const unwrapRelationJumpTarget = (room: Room, eventId: string, maxHops = 24): string => {
  let current = eventId;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const ev = room.findEventById(current);
    if (!ev) return current;
    if (!reactionOrEditEvent(ev)) return current;
    const related = ev.getRelation()?.event_id;
    if (typeof related !== 'string' || related === current) return current;
    current = related;
  }
  return current;
};

const findRelationChildEvent = (
  timelineSet: EventTimelineSet,
  eventId: string
): MatrixEvent | undefined => {
  for (const timeline of timelineSet.getTimelines()) {
    for (const parent of timeline.getEvents()) {
      const parentId = parent.getId();
      if (!parentId) continue;

      const reactionRelations = getEventReactions(timelineSet, parentId);
      if (reactionRelations) {
        const reaction = reactionRelations
          .getRelations()
          .find((candidate) => candidate.getId() === eventId);
        if (reaction) return reaction;
      }

      const editRelations = getEventEdits(timelineSet, parentId, parent.getType());
      if (editRelations) {
        const edit = editRelations
          .getRelations()
          .find((candidate) => candidate.getId() === eventId);
        if (edit) return edit;
      }
    }
  }
  return undefined;
};

export const findRoomEventById = (
  room: Room,
  eventId: string,
  timelineSet?: EventTimelineSet
): MatrixEvent | undefined => {
  const set = timelineSet ?? room.getUnfilteredTimelineSet();
  return (
    set.findEventById(eventId) ??
    room.findEventById(eventId) ??
    findRelationChildEvent(set, eventId)
  );
};

export type ResolvedReplyDraftTarget = {
  eventId: string;
  replyEvt: MatrixEvent;
};

export const extractReplyDraftBody = (
  replyEvt: MatrixEvent,
  timelineSet: EventTimelineSet
): { body: string; formattedBody: string } => {
  const replyId = replyEvt.getId();
  const editedReply =
    replyId !== undefined && !isEditEvent(replyEvt)
      ? getEditedEvent(replyId, replyEvt, timelineSet)
      : undefined;
  const editedNewContent = editedReply?.getContent()['m.new_content'];
  const content = (editedNewContent ?? replyEvt.getContent()) as Record<string, unknown>;
  const { body, formatted_body: formattedBody } = content;
  const msc1767body = content['m.text'];

  const resolvedBody =
    (typeof body === 'string' ? body : undefined) ??
    (typeof msc1767body === 'string'
      ? msc1767body
      : (msc1767body as { body?: string } | undefined)?.body) ??
    getMessageVersionBody(replyEvt) ??
    '';

  return {
    body: resolvedBody,
    formattedBody: typeof formattedBody === 'string' ? formattedBody : '',
  };
};

export const resolveReplyDraftTarget = (
  room: Room,
  clickedEventId: string,
  timelineSet?: EventTimelineSet
): ResolvedReplyDraftTarget | undefined => {
  const set = timelineSet ?? room.getUnfilteredTimelineSet();
  const replyEvt = findRoomEventById(room, clickedEventId, set);
  if (!replyEvt) return undefined;

  const eventId = replyEvt.getId();
  if (!eventId) return undefined;

  return { eventId, replyEvt };
};

export const getMentionContent = (userIds: string[], room: boolean): IMentions => {
  const mMentions: IMentions = {};
  if (userIds.length > 0) {
    mMentions.user_ids = userIds;
  }
  if (room) {
    mMentions.room = true;
  }

  return mMentions;
};

export const getCommonRooms = (
  mx: MatrixClient,
  rooms: string[],
  otherUserId: string
): string[] => {
  const commonRooms: string[] = [];

  rooms.forEach((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== (KnownMembership.Join as string)) return;

    const common = room.hasMembershipState(otherUserId, KnownMembership.Join);
    if (common) {
      commonRooms.push(roomId);
    }
  });

  return commonRooms;
};

export const bannedInRooms = (mx: MatrixClient, rooms: string[], otherUserId: string): boolean =>
  rooms.some((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== (KnownMembership.Join as string)) return false;

    return room.hasMembershipState(otherUserId, KnownMembership.Ban);
  });
