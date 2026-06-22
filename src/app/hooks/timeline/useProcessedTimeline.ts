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
  /**
   * Minutes of inactivity before a new message from the same sender gets a
   * full user header. Defaults to 2 (the original behaviour). Set higher
   * (e.g. 15) for Discord-style compact grouping.
   */
  messageGroupingThreshold: number;
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

/** Raw timeline indices for skipped events can also advance to the next visible row when needed. */
export function getProcessedRowIndexForRawTimelineIndexForward(
  processedEvents: ProcessedEvent[],
  startRawIndex: number
): { rowIndex: number; focusRawIndex: number } | undefined {
  const exactRowIndex = processedEvents.findIndex((e) => e.itemIndex === startRawIndex);
  if (exactRowIndex >= 0) {
    return {
      rowIndex: exactRowIndex,
      focusRawIndex: processedEvents[exactRowIndex]!.itemIndex,
    };
  }

  const rowIndex = processedEvents.findIndex((e) => e.itemIndex >= startRawIndex);
  if (rowIndex < 0) return undefined;

  return {
    rowIndex,
    focusRawIndex: processedEvents[rowIndex]!.itemIndex,
  };
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
  readUptoEventId: string | undefined,
  messageGroupingThreshold: number
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
        const withinTimeThreshold =
          messageGroupingThreshold > 0 &&
          minuteDifference(prevEvent.getTs(), mEvent.getTs()) < messageGroupingThreshold;
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

const mergeDraftsAndExtras = (
  result: ProcessedEvent[],
  extras: {
    mEvent: MatrixEvent;
    timelineSet: EventTimelineSet;
    parentId: string;
    itemIndex?: number;
  }[]
): ProcessedEventDraft[] => {
  const resultDrafts = result.map(
    ({ collapsed: _c, willRenderNewDivider: _n, willRenderDayDivider: _d, ...draft }) => draft
  );

  const extraDrafts = extras
    .map(({ mEvent, timelineSet, parentId, itemIndex = -1 }) => ({
      draft: {
        id: mEvent.getId()!,
        itemIndex,
        mEvent,
        timelineSet,
        eventSender: mEvent.getSender() ?? null,
      },
      effectiveTs: mEvent.getTs(),
      parentId,
    }))
    .toSorted((a, b) => a.effectiveTs - b.effectiveTs);

  const buckets: ProcessedEventDraft[][] = Array.from(
    { length: resultDrafts.length + 1 },
    () => []
  );

  for (const extra of extraDrafts) {
    const extraTs = extra.effectiveTs;
    let parentIdx = -1;
    for (let i = 0; i < resultDrafts.length; i += 1) {
      if (resultDrafts[i]!.id === extra.parentId) {
        parentIdx = i;
        break;
      }
    }

    let insertIdx = parentIdx + 1;
    for (let i = parentIdx + 1; i < resultDrafts.length; i += 1) {
      if (resultDrafts[i]!.mEvent.getTs() > extraTs) {
        break;
      }
      insertIdx = i + 1;
    }
    buckets[insertIdx]!.push(extra.draft);
  }

  const mergedDrafts: ProcessedEventDraft[] = [...buckets[0]!];
  for (let i = 0; i < resultDrafts.length; i += 1) {
    mergedDrafts.push(resultDrafts[i]!);
    mergedDrafts.push(...buckets[i + 1]!);
  }

  return mergedDrafts;
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
  readUptoEventId: string | undefined,
  messageGroupingThreshold: number
): ProcessedEvent[] => {
  if (hideMemberInReadOnly && isReadOnly) return result;

  const existingIds = new Set(result.map((event) => event.id));
  const baseDrafts: ProcessedEvent[] = [];
  const inlineExtras: {
    mEvent: MatrixEvent;
    timelineSet: EventTimelineSet;
    parentId: string;
    itemIndex: number;
  }[] = [];

  for (const draft of result) {
    if (isReactionEvent(draft.mEvent)) {
      const relation = draft.mEvent.getRelation();
      const parentId = relation?.event_id;
      if (parentId) {
        inlineExtras.push({
          mEvent: draft.mEvent,
          timelineSet: draft.timelineSet,
          parentId,
          itemIndex: draft.itemIndex,
        });
        continue;
      }
    }
    baseDrafts.push(draft);
  }

  const extras = collectRelationReactionEvents(
    linkedTimelines,
    existingIds,
    ignoredUsersSet,
    hiddenEventReactions,
    hiddenEventReactionTombstone
  );

  const allExtras = [...inlineExtras, ...extras];
  if (allExtras.length === 0) return baseDrafts;

  const mergedDrafts = mergeDraftsAndExtras(baseDrafts, allExtras);

  return computeCollapseAndDividers(
    mergedDrafts,
    mxUserId,
    readUptoEventId,
    messageGroupingThreshold
  );
};

const mergeRelationEdits = (
  result: ProcessedEvent[],
  linkedTimelines: EventTimeline[],
  ignoredUsersSet: Set<string>,
  hiddenEventEdits: boolean,
  mxUserId: string | null,
  readUptoEventId: string | undefined,
  messageGroupingThreshold: number
): ProcessedEvent[] => {
  const existingIds = new Set(result.map((event) => event.id));
  const baseDrafts: ProcessedEvent[] = [];
  const inlineExtras: {
    mEvent: MatrixEvent;
    timelineSet: EventTimelineSet;
    parentId: string;
    itemIndex: number;
  }[] = [];

  for (const draft of result) {
    if (isEditEvent(draft.mEvent)) {
      const relation = draft.mEvent.getRelation();
      const parentId = relation?.event_id;
      if (parentId) {
        inlineExtras.push({
          mEvent: draft.mEvent,
          timelineSet: draft.timelineSet,
          parentId,
          itemIndex: draft.itemIndex,
        });
        continue;
      }
    }
    baseDrafts.push(draft);
  }

  const extras = collectRelationEditEvents(
    linkedTimelines,
    existingIds,
    ignoredUsersSet,
    hiddenEventEdits
  );

  const allExtras = [...inlineExtras, ...extras];
  if (allExtras.length === 0) return baseDrafts;

  const mergedDrafts = mergeDraftsAndExtras(baseDrafts, allExtras);

  return computeCollapseAndDividers(
    mergedDrafts,
    mxUserId,
    readUptoEventId,
    messageGroupingThreshold
  );
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
  messageGroupingThreshold,
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
    // Sort items by origin_server_ts so events always render in chronological
    // order even when the SDK stores them in receipt order.  This is visible
    // after a sliding-sync gap on mobile resume (TimelineReset delivers a full
    // batch at once) and for bridge-backfilled or federated messages where
    // receipt order ≠ timestamp order.  Receipt order is preserved as a
    // tiebreaker so threading / causality is not affected.
    const sortedItems = items.toSorted((a, b) => {
      const [tlA, baseA] = getTimelineAndBaseIndex(linkedTimelines, a);
      const [tlB, baseB] = getTimelineAndBaseIndex(linkedTimelines, b);
      const evA = tlA ? getTimelineEvent(tlA, getTimelineRelativeIndex(a, baseA)) : null;
      const evB = tlB ? getTimelineEvent(tlB, getTimelineRelativeIndex(b, baseB)) : null;
      const tsA = evA?.getTs() ?? 0;
      const tsB = evB?.getTs() ?? 0;
      if (tsA !== tsB) return tsA - tsB;
      return a - b; // receipt order tiebreaker keeps causally-related events stable
    });

    let prevEvent: MatrixEvent | undefined;
    let isPrevRendered = false;
    let newDivider = false;
    let dayDivider = false;

    const result = sortedItems.reduce<ProcessedEvent[]>((acc, item) => {
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

      // Extract thread root from m.relates_to even when SDK didn't set threadRootId
      // (sliding sync bug where thread relations arrive without threadId resolved)
      const actualThreadRoot = (() => {
        if (threadRootId !== undefined) return threadRootId;
        const relation =
          mEvent.getRelation?.() ??
          (
            mEvent.getWireContent?.() as {
              'm.relates_to'?: { rel_type?: unknown; event_id?: unknown };
            }
          )?.['m.relates_to'] ??
          (
            mEvent.getContent?.() as { 'm.relates_to'?: { rel_type?: unknown; event_id?: unknown } }
          )?.['m.relates_to'];
        if (relation?.rel_type === 'm.thread' && typeof relation.event_id === 'string') {
          return relation.event_id;
        }
        return undefined;
      })();

      if (
        !skipThreadFilter &&
        actualThreadRoot !== undefined &&
        actualThreadRoot !== mEventId &&
        isThreadRelationEvent(mEvent, actualThreadRoot)
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
        // Only insert a day divider when moving *forward* to a new calendar day.
        // Bridged messages (Discord, Signal, …) arrive with an origin_server_ts from
        // an earlier day but are inserted at the end of the timeline by the SDK.
        // Showing a backward day divider ("Yesterday" after "Today" messages) breaks
        // the visual ordering, so we suppress dividers for out-of-order events.
        dayDivider = prevEvent
          ? !inSameDay(prevEvent.getTs(), mEvent.getTs()) && mEvent.getTs() > prevEvent.getTs()
          : false;
      }

      const isMessageEvent = isMessageRow(mEvent);

      let collapsed = false;
      if (isPrevRendered && !dayDivider && prevEvent !== undefined) {
        if (isMessageEvent) {
          const withinTimeThreshold =
            minuteDifference(prevEvent.getTs(), mEvent.getTs()) < messageGroupingThreshold;
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
        readUptoEventId,
        messageGroupingThreshold
      ),
      linkedTimelines,
      ignoredUsersSet,
      hiddenEventEdits,
      mxUserId,
      readUptoEventId,
      messageGroupingThreshold
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
    messageGroupingThreshold,
  ]);
}
