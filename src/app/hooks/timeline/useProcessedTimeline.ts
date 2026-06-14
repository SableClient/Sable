import { useMemo } from 'react';
import type { MatrixEvent, EventTimelineSet, EventTimeline } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
import {
  getTimelineAndBaseIndex,
  getTimelineRelativeIndex,
  getTimelineEvent,
} from '$utils/timeline';
import {
  isMembershipChanged,
  isThreadRelationEvent,
  isEditEvent,
  isReactionEvent,
  isRedactableMessageType,
  shouldShowRedactionTimelineEvent,
  getRedactionTargetEvent,
  collectRelationReactionEvents,
  collectRelationEditEvents,
} from '$utils/room';
import { inSameDay, minuteDifference } from '$utils/time';
import type { ResolvedHiddenEventSettings } from '$state/hooks/settings';

export interface UseProcessedTimelineOptions {
  items: number[];
  linkedTimelines: EventTimeline[];
  ignoredUsersSet: Set<string>;
  hiddenEvents: ResolvedHiddenEventSettings;
  mxUserId: string | null;
  readUptoEventId: string | undefined;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  isReadOnly: boolean;
  hideMemberInReadOnly: boolean;
  /**
   * When true, skip the filter that removes events whose `threadRootId` points
   * to a different event.  Required when processing a thread's own timeline
   * where every reply legitimately has `threadRootId` set to the root.
   */
  skipThreadFilter?: boolean;
}

export interface ProcessedEvent {
  id: string;
  itemIndex: number;
  mEvent: MatrixEvent;
  timelineSet: EventTimelineSet;
  eventSender: string | null;
  collapsed: boolean;
  willRenderNewDivider: boolean;
  willRenderDayDivider: boolean;
}

/** Raw timeline indices for skipped events (reactions, edits, …) have no row; walk backward to a visible one. */
export function getProcessedRowIndexForRawTimelineIndex(
  processedEvents: ProcessedEvent[],
  startRawIndex: number
): { rowIndex: number; focusRawIndex: number } | undefined {
  if (startRawIndex < 0) return undefined;
  for (let i = startRawIndex; i >= 0; i -= 1) {
    const rowIndex = processedEvents.findIndex((e) => e.itemIndex === i);
    if (rowIndex >= 0) return { rowIndex, focusRawIndex: i };
  }
  return undefined;
}

const MESSAGE_EVENT_TYPES = new Set([
  'm.room.message',
  'm.room.message.encrypted',
  'm.sticker',
  'm.room.encrypted',
]);

const normalizeMessageType = (t: string): string =>
  t === 'm.room.encrypted' || t === 'm.room.message.encrypted' ? 'm.room.message' : t;

const isMessageRow = (mEvent: MatrixEvent): boolean =>
  MESSAGE_EVENT_TYPES.has(mEvent.getType()) && !isEditEvent(mEvent);

const getPmpId = (ev: MatrixEvent): string | null =>
  ev.getContent()?.['com.beeper.per_message_profile']?.id ?? null;

type ProcessedEventDraft = Omit<
  ProcessedEvent,
  'collapsed' | 'willRenderNewDivider' | 'willRenderDayDivider'
>;

const computeCollapseAndDividers = (
  drafts: ProcessedEventDraft[],
  mxUserId: string | null,
  readUptoEventId: string | undefined
): ProcessedEvent[] => {
  let prevEvent: MatrixEvent | undefined;
  let isPrevRendered = false;
  let newDivider = false;
  let dayDivider = false;

  return drafts.map((draft) => {
    const { mEvent, eventSender } = draft;
    const type = mEvent.getType();

    if (!newDivider && readUptoEventId) {
      const prevId = prevEvent ? prevEvent.getId() : undefined;
      newDivider = prevId === readUptoEventId;
    }

    if (!dayDivider) {
      dayDivider = prevEvent ? !inSameDay(prevEvent.getTs(), mEvent.getTs()) : false;
    }

    const isMessageEvent = isMessageRow(mEvent);

    let collapsed = false;
    if (isPrevRendered && !dayDivider && prevEvent !== undefined) {
      if (isMessageEvent) {
        const withinTimeThreshold = minuteDifference(prevEvent.getTs(), mEvent.getTs()) < 2;
        const senderMatch = prevEvent.getSender() === eventSender;
        const typeMatch = normalizeMessageType(prevEvent.getType()) === normalizeMessageType(type);
        const dividerOk = !newDivider || eventSender === mxUserId;

        collapsed =
          dividerOk &&
          isMessageRow(prevEvent) &&
          senderMatch &&
          typeMatch &&
          withinTimeThreshold &&
          getPmpId(prevEvent) === getPmpId(mEvent);
      } else {
        collapsed = !isMessageRow(prevEvent);
      }
    }

    const willRenderNewDivider = newDivider && eventSender !== mxUserId;
    const willRenderDayDivider = dayDivider;

    prevEvent = mEvent;
    isPrevRendered = true;
    if (willRenderNewDivider) newDivider = false;
    if (willRenderDayDivider) dayDivider = false;

    return {
      ...draft,
      collapsed,
      willRenderNewDivider,
      willRenderDayDivider,
    };
  });
};

const mergeRelationReactions = (
  result: ProcessedEvent[],
  linkedTimelines: EventTimeline[],
  ignoredUsersSet: Set<string>,
  hiddenEventReactions: boolean,
  hiddenEventReactionTombstone: boolean,
  hideMemberInReadOnly: boolean,
  isReadOnly: boolean,
  mxUserId: string | null,
  readUptoEventId: string | undefined
): ProcessedEvent[] => {
  if (hideMemberInReadOnly && isReadOnly) return result;

  const existingIds = new Set(result.map((event) => event.id));
  const extras = collectRelationReactionEvents(
    linkedTimelines,
    existingIds,
    ignoredUsersSet,
    hiddenEventReactions,
    hiddenEventReactionTombstone
  );

  if (extras.length === 0) return result;

  const mergedDrafts: ProcessedEventDraft[] = [
    ...result.map(
      ({ collapsed: _c, willRenderNewDivider: _n, willRenderDayDivider: _d, ...draft }) => draft
    ),
    ...extras.map(({ mEvent, timelineSet }) => {
      const mEventId = mEvent.getId()!;
      return {
        id: mEventId,
        itemIndex: -1,
        mEvent,
        timelineSet,
        eventSender: mEvent.getSender() ?? null,
      };
    }),
  ].toSorted((a, b) => a.mEvent.getTs() - b.mEvent.getTs());

  return computeCollapseAndDividers(mergedDrafts, mxUserId, readUptoEventId);
};

const mergeRelationEdits = (
  result: ProcessedEvent[],
  linkedTimelines: EventTimeline[],
  ignoredUsersSet: Set<string>,
  hiddenEventEdits: boolean,
  mxUserId: string | null,
  readUptoEventId: string | undefined
): ProcessedEvent[] => {
  const existingIds = new Set(result.map((event) => event.id));
  const extras = collectRelationEditEvents(
    linkedTimelines,
    existingIds,
    ignoredUsersSet,
    hiddenEventEdits
  );

  if (extras.length === 0) return result;

  const mergedDrafts: ProcessedEventDraft[] = [
    ...result.map(
      ({ collapsed: _c, willRenderNewDivider: _n, willRenderDayDivider: _d, ...draft }) => draft
    ),
    ...extras.map(({ mEvent, timelineSet }) => {
      const mEventId = mEvent.getId()!;
      return {
        id: mEventId,
        itemIndex: -1,
        mEvent,
        timelineSet,
        eventSender: mEvent.getSender() ?? null,
      };
    }),
  ].toSorted((a, b) => a.mEvent.getTs() - b.mEvent.getTs());

  return computeCollapseAndDividers(mergedDrafts, mxUserId, readUptoEventId);
};

export function useProcessedTimeline({
  items,
  linkedTimelines,
  ignoredUsersSet,
  hiddenEvents,
  mxUserId,
  readUptoEventId,
  hideMembershipEvents,
  hideNickAvatarEvents,
  isReadOnly,
  hideMemberInReadOnly,
  skipThreadFilter,
}: UseProcessedTimelineOptions): ProcessedEvent[] {
  const {
    showHiddenEvents,
    showTombstoneEvents,
    hiddenEventEdits,
    hiddenEventRedactionTimeline,
    hiddenEventReactions,
    hiddenEventReactionTombstone,
    hiddenEventReactionRedactionTimeline,
    hiddenEventOther,
  } = hiddenEvents;

  return useMemo(() => {
    let prevEvent: MatrixEvent | undefined;
    let isPrevRendered = false;
    let newDivider = false;
    let dayDivider = false;

    const result = items.reduce<ProcessedEvent[]>((acc, item) => {
      const [eventTimeline, baseIndex] = getTimelineAndBaseIndex(linkedTimelines, item);
      if (!eventTimeline) return acc;

      const timelineSet = eventTimeline.getTimelineSet();
      const mEvent = getTimelineEvent(eventTimeline, getTimelineRelativeIndex(item, baseIndex));

      if (!mEvent) return acc;

      const { threadRootId } = mEvent;

      const mEventId = mEvent.getId();
      if (!mEventId) return acc;

      const eventSender = mEvent.getSender() ?? null;

      if (eventSender && ignoredUsersSet.has(eventSender)) return acc;

      const type = mEvent.getType();
      const isEdit = isEditEvent(mEvent);
      const isReaction = isReactionEvent(mEvent);
      const isRedactionEvt = mEvent.isRedaction();

      if (hideMemberInReadOnly && isReadOnly) {
        if (isReaction) return acc;
        if (
          isRedactionEvt &&
          getRedactionTargetEvent(timelineSet, mEvent)?.getType() === (EventType.Reaction as string)
        ) {
          return acc;
        }
      }

      if (mEvent.isRedacted()) {
        const showMessageTombstone = showTombstoneEvents && isRedactableMessageType(type);
        const showReactionTombstone = hiddenEventReactionTombstone && isReaction;
        if (!showMessageTombstone && !showReactionTombstone) return acc;
      }

      if (type === 'm.room.member') {
        const membershipChanged = isMembershipChanged(mEvent);
        if (hideMemberInReadOnly && isReadOnly) return acc;
        if (membershipChanged && hideMembershipEvents) return acc;
        if (!membershipChanged && hideNickAvatarEvents) return acc;
      }

      const allowSpecificHiddenEvent =
        (isEdit && hiddenEventEdits) ||
        (isReaction && !mEvent.isRedacted() && hiddenEventReactions) ||
        (isReaction && mEvent.isRedacted() && hiddenEventReactionTombstone) ||
        (isRedactionEvt &&
          shouldShowRedactionTimelineEvent(
            mEvent,
            timelineSet,
            hiddenEventRedactionTimeline,
            hiddenEventReactionRedactionTimeline
          ));

      if (!(showHiddenEvents && hiddenEventOther)) {
        const isStandardRendered = [
          'm.room.message',
          'm.room.message.encrypted',
          'm.sticker',
          'm.room.member',
          'm.room.name',
          'm.room.topic',
          'm.room.avatar',
          'org.matrix.msc3401.call.member',
        ].includes(type);

        if (!isStandardRendered) {
          if (Object.keys(mEvent.getContent()).length === 0 && !allowSpecificHiddenEvent)
            return acc;
          if (!allowSpecificHiddenEvent) {
            if (mEvent.getRelation()) return acc;
            if (mEvent.isRedaction()) return acc;
          }
        }
      }

      if (
        !skipThreadFilter &&
        threadRootId !== undefined &&
        threadRootId !== mEventId &&
        isThreadRelationEvent(mEvent, threadRootId)
      )
        return acc;

      if (isEdit && !hiddenEventEdits) return acc;
      if (isReaction) {
        if (mEvent.isRedacted()) {
          if (!hiddenEventReactionTombstone) return acc;
        } else if (!hiddenEventReactions) {
          return acc;
        }
      }
      if (
        isRedactionEvt &&
        !shouldShowRedactionTimelineEvent(
          mEvent,
          timelineSet,
          hiddenEventRedactionTimeline,
          hiddenEventReactionRedactionTimeline
        )
      )
        return acc;

      if (!newDivider && readUptoEventId) {
        const prevId = prevEvent ? prevEvent.getId() : undefined;
        newDivider = prevId === readUptoEventId;
      }

      if (!dayDivider) {
        dayDivider = prevEvent ? !inSameDay(prevEvent.getTs(), mEvent.getTs()) : false;
      }

      const isMessageEvent = isMessageRow(mEvent);

      let collapsed = false;
      if (isPrevRendered && !dayDivider && prevEvent !== undefined) {
        if (isMessageEvent) {
          const withinTimeThreshold = minuteDifference(prevEvent.getTs(), mEvent.getTs()) < 2;
          const senderMatch = prevEvent.getSender() === eventSender;
          const typeMatch =
            normalizeMessageType(prevEvent.getType()) === normalizeMessageType(type);
          const dividerOk = !newDivider || eventSender === mxUserId;

          collapsed =
            dividerOk &&
            isMessageRow(prevEvent) &&
            senderMatch &&
            typeMatch &&
            withinTimeThreshold &&
            getPmpId(prevEvent) === getPmpId(mEvent);
        } else {
          collapsed = !isMessageRow(prevEvent);
        }
      }

      const willRenderNewDivider = newDivider && eventSender !== mxUserId;
      const willRenderDayDivider = dayDivider;

      const processed: ProcessedEvent = {
        id: mEventId,
        itemIndex: item,
        mEvent,
        timelineSet,
        eventSender,
        collapsed,
        willRenderNewDivider,
        willRenderDayDivider,
      };

      prevEvent = mEvent;
      isPrevRendered = true;
      if (willRenderNewDivider) newDivider = false;
      if (willRenderDayDivider) dayDivider = false;

      acc.push(processed);
      return acc;
    }, []);

    return mergeRelationEdits(
      mergeRelationReactions(
        result,
        linkedTimelines,
        ignoredUsersSet,
        hiddenEventReactions,
        hiddenEventReactionTombstone,
        hideMemberInReadOnly,
        isReadOnly,
        mxUserId,
        readUptoEventId
      ),
      linkedTimelines,
      ignoredUsersSet,
      hiddenEventEdits,
      mxUserId,
      readUptoEventId
    );
  }, [
    items,
    linkedTimelines,
    ignoredUsersSet,
    showHiddenEvents,
    showTombstoneEvents,
    hiddenEventEdits,
    hiddenEventRedactionTimeline,
    hiddenEventReactions,
    hiddenEventReactionTombstone,
    hiddenEventReactionRedactionTimeline,
    hiddenEventOther,
    mxUserId,
    readUptoEventId,
    hideMembershipEvents,
    hideNickAvatarEvents,
    isReadOnly,
    hideMemberInReadOnly,
    skipThreadFilter,
  ]);
}
