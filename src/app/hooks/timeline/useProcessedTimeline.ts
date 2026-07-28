import { useMemo, useRef } from 'react';
import type { MatrixEvent, EventTimelineSet, EventTimeline } from '$types/matrix-sdk';
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
  editId: string | undefined;
  reactionsKey: string;
  content: unknown;
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

const MESSAGE_EVENT_TYPES = new Set([
  'm.room.message',
  'm.room.message.encrypted',
  'm.sticker',
  'm.room.encrypted',
]);

export const STANDARD_RENDERED_EVENT_TYPES = new Set([
  'm.room.message',
  'm.room.message.encrypted',
  'm.sticker',
  M_POLL_START.name,
  'm.room.member',
  'm.room.name',
  'm.room.topic',
  'm.room.avatar',
  'org.matrix.msc3401.call.member',
]);

const normalizeMessageType = (t: string): string =>
  t === 'm.room.encrypted' || t === 'm.room.message.encrypted' ? 'm.room.message' : t;

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
>;

type TimelineEventEntry = {
  mEvent: MatrixEvent;
  timelineSet: EventTimelineSet;
};

const flattenTimelineEvents = (linkedTimelines: EventTimeline[]): TimelineEventEntry[] => {
  const entries: TimelineEventEntry[] = [];
  linkedTimelines.forEach((timeline) => {
    const timelineSet = timeline.getTimelineSet();
    timeline.getEvents().forEach((mEvent) => entries.push({ mEvent, timelineSet }));
  });
  return entries;
};

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
  const indexById = new Map(resultDrafts.map((draft, index) => [draft.id, index]));

  for (const extra of extraDrafts) {
    const extraTs = extra.effectiveTs;
    const parentIdx = indexById.get(extra.parentId) ?? -1;
    let low = parentIdx + 1;
    let high = resultDrafts.length;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (resultDrafts[mid]!.mEvent.getTs() <= extraTs) low = mid + 1;
      else high = mid;
    }
    buckets[low]!.push(extra.draft);
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

  return computeCollapseAndDividers(mergedDrafts, mxUserId, readUptoEventId);
};

type TimelineProcessingState = {
  prevEvent?: MatrixEvent;
  prevIteratedEventId?: string;
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
  const state = { ...initialState };
  const result: ProcessedEvent[] = [];

  for (const item of items) {
    const entry = timelineEvents[item];
    if (!entry) continue;
    const { mEvent, timelineSet } = entry;
    const { threadRootId } = mEvent;
    const mEventId = mEvent.getId();
    if (!mEventId) continue;

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

    if (mEvent.isRedacted()) {
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
      if (mEvent.isRedacted()) {
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
      previous.timelineEvents.every(
        (entry, index) => entry.mEvent === timelineEvents[index]?.mEvent
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
  ]);
}
