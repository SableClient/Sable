import { useMemo, useRef } from 'react';
import type { MatrixEvent, EventStatus, EventTimelineSet, EventTimeline } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';
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
  getEditedEvent,
  getEventReactions,
} from '$utils/room/relations';
import { inSameDay, minuteDifference } from '$utils/time';
import type { ResolvedHiddenEventSettings } from '$state/hooks/settings';
import { M_POLL_START } from 'matrix-js-sdk';

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
  /** Bumped when displayed timeline events mutate in place (redactions, decrypt, reactions). */
  timelineVersion?: number;
}

export interface ProcessedEvent {
  id: string;
  itemIndex: number;
  mEvent: MatrixEvent;
  isRedacted: boolean;
  timelineSet: EventTimelineSet;
  eventSender: string | null;
  collapsed: boolean;
  willRenderNewDivider: boolean;
  willRenderDayDivider: boolean;
  editId: string | undefined;
  reactionsKey: string;
  content: unknown;
  // MatrixEvent status changes in place, so include it in row memoization.
  sendStatus: EventStatus | null;
}

/** Raw timeline indices for skipped events (reactions, edits, …) have no row; walk backward to a visible one. */
export function getProcessedRowIndexForRawTimelineIndex(
  processedEvents: ProcessedEvent[],
  startRawIndex: number
): { rowIndex: number; focusRawIndex: number } | undefined {
  if (startRawIndex < 0) return undefined;
  let bestRowIndex = -1;
  let bestRawIndex = -1;
  for (let rowIndex = 0; rowIndex < processedEvents.length; rowIndex += 1) {
    const rawIndex = processedEvents[rowIndex]?.itemIndex ?? -1;
    if (rawIndex >= 0 && rawIndex <= startRawIndex && rawIndex > bestRawIndex) {
      bestRowIndex = rowIndex;
      bestRawIndex = rawIndex;
    }
  }
  return bestRowIndex >= 0 ? { rowIndex: bestRowIndex, focusRawIndex: bestRawIndex } : undefined;
}

const MESSAGE_EVENT_TYPES = new Set<string>([
  EventType.RoomMessage,
  EventType.Sticker,
  EventType.RoomMessageEncrypted,
]);

export const STANDARD_RENDERED_EVENT_TYPES = new Set<string>([
  EventType.RoomMessage,
  // getType() reports this until decryption resolves the real type.
  EventType.RoomMessageEncrypted,
  EventType.Sticker,
  M_POLL_START.name,
  EventType.RoomMember,
  EventType.RoomName,
  EventType.RoomTopic,
  EventType.RoomAvatar,
  EventType.GroupCallMemberPrefix,
]);

const normalizeMessageType = (t: string): string =>
  t === (EventType.RoomMessageEncrypted as string) ? EventType.RoomMessage : t;

const isMessageRow = (mEvent: MatrixEvent): boolean =>
  MESSAGE_EVENT_TYPES.has(mEvent.getType()) && !isEditEvent(mEvent);

const getPmpId = (ev: MatrixEvent): string | null =>
  ev.getContent()?.['com.beeper.per_message_profile']?.id ?? null;

type ProcessedEventDraft = Omit<
  ProcessedEvent,
  | 'collapsed'
  | 'willRenderNewDivider'
  | 'willRenderDayDivider'
  | 'editId'
  | 'reactionsKey'
  | 'content'
  | 'sendStatus'
>;

const getTimelineTimestamp = (mEvent: MatrixEvent): number =>
  Number.isFinite(mEvent.localTimestamp) ? mEvent.localTimestamp : mEvent.getTs();

type TimelineEventEntry = {
  mEvent: MatrixEvent;
  timelineSet: EventTimelineSet;
  isRedacted: boolean;
  id: string | undefined;
  ts: number;
  // Decryption rewrites a MatrixEvent in place, so identity alone does not prove a cached
  // row still matches it. Undefined for unencrypted events.
  clearType: string | undefined;
  clearContent: unknown;
  sendStatus: EventStatus | null;
};

const flattenTimelineEvents = (linkedTimelines: EventTimeline[]): TimelineEventEntry[] => {
  const entries: TimelineEventEntry[] = [];
  linkedTimelines.forEach((timeline) => {
    const timelineSet = timeline.getTimelineSet();
    timeline.getEvents().forEach((mEvent) => {
      const encrypted = mEvent.isEncrypted();
      entries.push({
        mEvent,
        timelineSet,
        isRedacted: mEvent.isRedacted(),
        id: mEvent.getId(),
        ts: mEvent.getTs(),
        clearType: encrypted ? mEvent.getType() : undefined,
        clearContent: encrypted ? mEvent.getContent() : undefined,
        sendStatus: mEvent.getAssociatedStatus(),
      });
    });
  });
  return entries;
};

const isCachedEntryCurrent = (
  cached: TimelineEventEntry,
  current: TimelineEventEntry | undefined
): boolean =>
  cached.mEvent === current?.mEvent &&
  cached.id === current.id &&
  cached.ts === current.ts &&
  cached.isRedacted === current.isRedacted &&
  cached.clearType === current.clearType &&
  cached.clearContent === current.clearContent &&
  cached.sendStatus === current.sendStatus;

const computeCollapseAndDividers = (
  drafts: ProcessedEventDraft[],
  mxUserId: string | null,
  readUptoEventId: string | undefined,
  // Row that already carries the divider. Drafts hold only rendered rows, so a
  // receipt anchored on a filtered event is unresolvable from `drafts` alone.
  carriedDividerId: string | undefined
): ProcessedEvent[] => {
  let prevEvent: MatrixEvent | undefined;
  let isPrevRendered = false;
  let newDivider = false;
  let dayDivider = false;
  let dividerPlaced = false;

  return drafts.map((draft) => {
    const { mEvent, eventSender } = draft;
    const type = mEvent.getType();

    if (!newDivider && !dividerPlaced && readUptoEventId) {
      const prevId = prevEvent ? prevEvent.getId() : undefined;
      newDivider = prevId === readUptoEventId || draft.id === carriedDividerId;
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
    if (willRenderNewDivider) {
      newDivider = false;
      dividerPlaced = true;
    }
    if (willRenderDayDivider) dayDivider = false;

    const editId = getEditedEvent(draft.id, mEvent, draft.timelineSet)?.getId();
    const reactions = getEventReactions(draft.timelineSet, draft.id)?.getSortedAnnotationsByKey();
    const reactionsKey = reactions ? reactions.map((r) => `${r[0]}:${r[1].size}`).join(',') : '';
    const content = mEvent.getContent();

    return {
      ...draft,
      collapsed,
      willRenderNewDivider,
      willRenderDayDivider,
      editId,
      reactionsKey,
      content,
      sendStatus: mEvent.getAssociatedStatus(),
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

  const extraDrafts = extras.map(({ mEvent, timelineSet, parentId, itemIndex = -1 }) => ({
    draft: {
      id: mEvent.getId()!,
      itemIndex,
      mEvent,
      isRedacted: mEvent.isRedacted(),
      timelineSet,
      eventSender: mEvent.getSender() ?? null,
    },
    parentId,
    timelineTs: getTimelineTimestamp(mEvent),
  }));
  const indexedExtraDrafts = extraDrafts.filter((extra) => extra.draft.itemIndex >= 0);
  const fetchedExtraDrafts = extraDrafts
    .filter((extra) => extra.draft.itemIndex < 0)
    .toSorted((a, b) => a.timelineTs - b.timelineTs);

  const buckets: ProcessedEventDraft[][] = Array.from(
    { length: resultDrafts.length + 1 },
    () => []
  );
  let timelineOrderIndex: { itemIndex: number; bucket: number }[] | undefined;

  const bucketByTimelineOrder = (itemIndex: number): number => {
    if (itemIndex < 0) return resultDrafts.length;
    if (!timelineOrderIndex) {
      timelineOrderIndex = resultDrafts
        .flatMap((draft, index) =>
          draft.itemIndex < 0 ? [] : [{ itemIndex: draft.itemIndex, bucket: index + 1 }]
        )
        .toSorted((a, b) => a.itemIndex - b.itemIndex);

      let maxBucket = 0;
      for (const entry of timelineOrderIndex) {
        maxBucket = Math.max(maxBucket, entry.bucket);
        entry.bucket = maxBucket;
      }
    }

    let low = 0;
    let high = timelineOrderIndex.length;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (timelineOrderIndex[mid]!.itemIndex <= itemIndex) low = mid + 1;
      else high = mid;
    }
    return low === 0 ? 0 : timelineOrderIndex[low - 1]!.bucket;
  };

  for (const extra of indexedExtraDrafts) {
    buckets[bucketByTimelineOrder(extra.draft.itemIndex)]!.push(extra.draft);
  }

  const mergedDrafts: ProcessedEventDraft[] = [...buckets[0]!];
  for (let i = 0; i < resultDrafts.length; i += 1) {
    mergedDrafts.push(resultDrafts[i]!);
    mergedDrafts.push(...buckets[i + 1]!);
  }

  for (const extra of fetchedExtraDrafts) {
    const parentIdx = mergedDrafts.findIndex((draft) => draft.id === extra.parentId);
    if (parentIdx < 0) {
      mergedDrafts.push(extra.draft);
      continue;
    }

    let insertionIdx = mergedDrafts.length;
    for (let i = parentIdx + 1; i < mergedDrafts.length; i += 1) {
      if (getTimelineTimestamp(mergedDrafts[i]!.mEvent) > extra.timelineTs) {
        insertionIdx = i;
        break;
      }
    }
    mergedDrafts.splice(insertionIdx, 0, extra.draft);
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
  readUptoEventId: string | undefined
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
    result.find((event) => event.willRenderNewDivider)?.id
  );
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
    result.find((event) => event.willRenderNewDivider)?.id
  );
};

type TimelineProcessingState = {
  prevEvent?: MatrixEvent;
  prevIteratedEventId?: string;
  seenEventIds: Set<string>;
  isPrevRendered: boolean;
  newDivider: boolean;
  dayDivider: boolean;
};

type TimelineProcessingOptions = Omit<
  UseProcessedTimelineOptions,
  'items' | 'linkedTimelines' | 'hiddenEvents'
> &
  ResolvedHiddenEventSettings;

const emptyProcessingState = (): TimelineProcessingState => ({
  seenEventIds: new Set(),
  isPrevRendered: false,
  newDivider: false,
  dayDivider: false,
});

const processTimelineItems = (
  items: number[],
  timelineEvents: TimelineEventEntry[],
  options: TimelineProcessingOptions,
  initialState: TimelineProcessingState = emptyProcessingState()
): { result: ProcessedEvent[]; state: TimelineProcessingState } => {
  const {
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
  } = options;
  const state = { ...initialState, seenEventIds: new Set(initialState.seenEventIds) };
  const result: ProcessedEvent[] = [];

  for (const item of items) {
    const entry = timelineEvents[item];
    if (!entry) continue;
    const { mEvent, timelineSet, isRedacted } = entry;
    const { threadRootId } = mEvent;
    const mEventId = mEvent.getId();
    if (!mEventId) continue;
    if (state.seenEventIds.has(mEventId)) continue;
    state.seenEventIds.add(mEventId);

    if (!state.newDivider && readUptoEventId) {
      state.newDivider = state.prevIteratedEventId === readUptoEventId;
    }
    state.prevIteratedEventId = mEventId;

    const eventSender = mEvent.getSender() ?? null;
    if (eventSender && ignoredUsersSet.has(eventSender)) continue;

    const type = mEvent.getType();
    const isEdit = isEditEvent(mEvent);
    const isReaction = isReactionEvent(mEvent);
    const isRedactionEvt = mEvent.isRedaction();

    if (hideMemberInReadOnly && isReadOnly) {
      if (isReaction) continue;
      if (
        isRedactionEvt &&
        getRedactionTargetEvent(timelineSet, mEvent)?.getType() === (EventType.Reaction as string)
      ) {
        continue;
      }
    }

    if (isRedacted) {
      const showMessageTombstone = showTombstoneEvents && isRedactableMessageType(type);
      const showReactionTombstone = hiddenEventReactionTombstone && isReaction;
      if (!showMessageTombstone && !showReactionTombstone) continue;
    }

    if (type === 'm.room.member') {
      const membershipChanged = isMembershipChanged(mEvent);
      if (hideMemberInReadOnly && isReadOnly) continue;
      if (membershipChanged && hideMembershipEvents) continue;
      if (!membershipChanged && hideNickAvatarEvents) continue;
    }

    const allowSpecificHiddenEvent =
      (isEdit && hiddenEventEdits) ||
      (isReaction && !isRedacted && hiddenEventReactions) ||
      (isReaction && isRedacted && hiddenEventReactionTombstone) ||
      (isRedactionEvt &&
        shouldShowRedactionTimelineEvent(
          mEvent,
          timelineSet,
          hiddenEventRedactionTimeline,
          hiddenEventReactionRedactionTimeline
        ));

    if (!(showHiddenEvents && hiddenEventOther)) {
      const isStandardRendered = STANDARD_RENDERED_EVENT_TYPES.has(type);
      if (!isStandardRendered && !allowSpecificHiddenEvent) {
        continue;
      }
    }

    if (
      !skipThreadFilter &&
      threadRootId !== undefined &&
      threadRootId !== mEventId &&
      isThreadRelationEvent(mEvent, threadRootId)
    ) {
      continue;
    }

    if (isEdit && !hiddenEventEdits) continue;
    if (isReaction) {
      if (isRedacted) {
        if (!hiddenEventReactionTombstone) continue;
      } else if (!hiddenEventReactions) {
        continue;
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
    ) {
      continue;
    }

    if (!state.dayDivider) {
      state.dayDivider = state.prevEvent
        ? !inSameDay(state.prevEvent.getTs(), mEvent.getTs())
        : false;
    }

    const isMessageEvent = isMessageRow(mEvent);
    let collapsed = false;
    if (state.isPrevRendered && !state.dayDivider && state.prevEvent !== undefined) {
      if (isMessageEvent) {
        const withinTimeThreshold = minuteDifference(state.prevEvent.getTs(), mEvent.getTs()) < 2;
        const senderMatch = state.prevEvent.getSender() === eventSender;
        const typeMatch =
          normalizeMessageType(state.prevEvent.getType()) === normalizeMessageType(type);
        const dividerOk = !state.newDivider || eventSender === mxUserId;
        collapsed =
          dividerOk &&
          isMessageRow(state.prevEvent) &&
          senderMatch &&
          typeMatch &&
          withinTimeThreshold &&
          getPmpId(state.prevEvent) === getPmpId(mEvent);
      } else {
        collapsed = !isMessageRow(state.prevEvent);
      }
    }

    const willRenderNewDivider = state.newDivider && eventSender !== mxUserId;
    const willRenderDayDivider = state.dayDivider;
    result.push({
      id: mEventId,
      itemIndex: item,
      mEvent,
      isRedacted,
      timelineSet,
      eventSender,
      collapsed,
      willRenderNewDivider,
      willRenderDayDivider,
      editId: getEditedEvent(mEventId, mEvent, timelineSet)?.getId(),
      reactionsKey:
        getEventReactions(timelineSet, mEventId)
          ?.getSortedAnnotationsByKey()
          ?.map((r) => `${r[0]}:${r[1].size}`)
          .join(',') ?? '',
      content: mEvent.getContent(),
      sendStatus: mEvent.getAssociatedStatus(),
    });

    state.prevEvent = mEvent;
    state.isPrevRendered = true;
    if (willRenderNewDivider) state.newDivider = false;
    if (willRenderDayDivider) state.dayDivider = false;
  }

  return { result, state };
};

type ProcessingCache = {
  timelineEvents: TimelineEventEntry[];
  itemsLength: number;
  optionValues: unknown[];
  state: TimelineProcessingState;
  result: ProcessedEvent[];
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
  timelineVersion = 0,
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
  const cacheRef = useRef<ProcessingCache | undefined>(undefined);

  return useMemo(() => {
    void timelineVersion;
    const timelineEvents = flattenTimelineEvents(linkedTimelines);
    const processingOptions: TimelineProcessingOptions = {
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
    };
    const optionValues = [
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
    ];
    const previous = cacheRef.current;
    const appendedEntries = previous
      ? timelineEvents.slice(previous.itemsLength).map(({ mEvent }) => mEvent)
      : [];
    const optionsUnchanged =
      previous?.optionValues.length === optionValues.length &&
      previous.optionValues.every((value, index) => Object.is(value, optionValues[index]));
    const isAppendOnly =
      previous !== undefined &&
      optionsUnchanged &&
      !hiddenEventEdits &&
      !hiddenEventReactions &&
      !hiddenEventReactionTombstone &&
      items.length === timelineEvents.length &&
      previous.itemsLength === previous.timelineEvents.length &&
      items.length > previous.itemsLength &&
      items.every((item, index) => item === index) &&
      // Cached rows are reused verbatim, so anchoring on the first and last event
      // alone would accept a run that both inserted and removed within the prefix.
      previous.timelineEvents.every((entry, index) =>
        isCachedEntryCurrent(entry, timelineEvents[index])
      ) &&
      (appendedEntries.length === 0 ||
        (previous.timelineEvents.at(-1)?.mEvent.getTs() ?? 0) <=
          (appendedEntries[0]?.getTs() ?? 0)) &&
      appendedEntries.every(
        (mEvent, index) =>
          !mEvent.getRelation() &&
          !mEvent.isRedaction() &&
          !mEvent.isRedacted() &&
          (index === 0 || (appendedEntries[index - 1]?.getTs() ?? 0) <= mEvent.getTs())
      );

    if (isAppendOnly) {
      const appendedItems = items.slice(previous.itemsLength);
      const appended = processTimelineItems(
        appendedItems,
        timelineEvents,
        processingOptions,
        previous.state
      );
      const result = [...previous.result, ...appended.result];
      cacheRef.current = {
        timelineEvents,
        itemsLength: items.length,
        optionValues,
        state: appended.state,
        result,
      };
      return result;
    }

    const processed = processTimelineItems(items, timelineEvents, processingOptions);
    const result = mergeRelationEdits(
      mergeRelationReactions(
        processed.result,
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
    cacheRef.current = {
      timelineEvents,
      itemsLength: items.length,
      optionValues,
      state: processed.state,
      result,
    };
    return result;
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
    timelineVersion,
  ]);
}
