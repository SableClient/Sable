import { useMemo, useRef } from 'react';
import { MatrixEvent, EventTimelineSet, EventTimeline } from '$types/matrix-sdk';
import {
  getTimelineAndBaseIndex,
  getTimelineRelativeIndex,
  getTimelineEvent,
} from '$utils/timeline';
import { reactionOrEditEvent, isMembershipChanged } from '$utils/room';
import { inSameDay, minuteDifference } from '$utils/time';

export interface UseProcessedTimelineOptions {
  items: number[];
  linkedTimelines: EventTimeline[];
  ignoredUsersSet: Set<string>;
  showHiddenEvents: boolean;
  showTombstoneEvents: boolean;
  mxUserId: string | null;
  readUptoEventId: string | undefined;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  isReadOnly: boolean;
  hideMemberInReadOnly: boolean;
  /**
  /**
   * When true, skip the filter that removes events whose `threadRootId` points
   * to a different event.  Required when processing a thread's own timeline
   * where every reply legitimately has `threadRootId` set to the root.
   */
  skipThreadFilter?: boolean;
  /**
   * Increment this whenever existing event content mutates (reactions, edits,
   * thread updates, local-echo).  When it changes, `useProcessedTimeline`
   * creates fresh `ProcessedEvent` objects so downstream `React.memo` item
   * components re-render to reflect updated content.  When unchanged (e.g. a
   * new event was appended), existing objects are reused by identity, letting
   * memo bail out for unchanged items.
   *
   * Optional — defaults to 0 (stable refs always applied after first render).
   * Call sites that do NOT use `React.memo` item components (e.g. `ThreadDrawer`)
   * can omit this; the SDK mutates `mEvent` in place so rendered content stays
   * correct regardless of object identity.
   */
  mutationVersion?: number;
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

const MESSAGE_EVENT_TYPES = [
  'm.room.message',
  'm.room.message.encrypted',
  'm.sticker',
  'm.room.encrypted',
];

const normalizeMessageType = (t: string): string =>
  t === 'm.room.encrypted' || t === 'm.room.message.encrypted' ? 'm.room.message' : t;

export function useProcessedTimeline({
  items,
  linkedTimelines,
  ignoredUsersSet,
  showHiddenEvents,
  showTombstoneEvents,
  mxUserId,
  readUptoEventId,
  hideMembershipEvents,
  hideNickAvatarEvents,
  isReadOnly,
  hideMemberInReadOnly,
  skipThreadFilter,
  mutationVersion = 0,
}: UseProcessedTimelineOptions): ProcessedEvent[] {
  // Stable-ref cache: reuse the same ProcessedEvent object for an event when
  // nothing structural changed. This lets React.memo on item components bail
  // out for the majority of items when only a new message was appended.
  const stableRefsCache = useRef<Map<string, ProcessedEvent>>(new Map());
  const prevMutationVersionRef = useRef(-1);

  return useMemo(() => {
    // When mutationVersion changes, existing event content has mutated (reaction
    // added, message edited, local-echo updated, thread reply). Create fresh
    // objects so memo item components re-render. When version is unchanged (only
    // items count changed), reuse cached refs for structurally-identical events.
    const isMutation = mutationVersion !== prevMutationVersionRef.current;
    prevMutationVersionRef.current = mutationVersion;
    const prevCache = isMutation ? null : stableRefsCache.current;

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

      const {
        getId: getEvtId,
        getSender: getEvtSender,
        isRedacted: getEvtIsRedacted,
        getTs: getEvtTs,
        getType: getEvtType,
        threadRootId,
      } = mEvent;

      const mEventId = getEvtId.call(mEvent);
      if (!mEventId) return acc;

      const eventSender = getEvtSender.call(mEvent) ?? null;

      if (eventSender && ignoredUsersSet.has(eventSender)) return acc;
      if (getEvtIsRedacted.call(mEvent) && !(showHiddenEvents || showTombstoneEvents)) return acc;

      const type = getEvtType.call(mEvent);

      if (type === 'm.room.member') {
        const membershipChanged = isMembershipChanged(mEvent);
        if (hideMemberInReadOnly && isReadOnly) return acc;
        if (membershipChanged && hideMembershipEvents) return acc;
        if (!membershipChanged && hideNickAvatarEvents) return acc;
      }

      if (!showHiddenEvents) {
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
          if (Object.keys(mEvent.getContent()).length === 0) return acc;
          if (mEvent.getRelation()) return acc;
          if (mEvent.isRedaction()) return acc;
        }
      }

      if (!skipThreadFilter && threadRootId !== undefined && threadRootId !== mEventId) return acc;

      const isReactionOrEdit = reactionOrEditEvent(mEvent);
      if (isReactionOrEdit) return acc;

      if (!newDivider && readUptoEventId) {
        const prevId = prevEvent ? prevEvent.getId() : undefined;
        newDivider = prevId === readUptoEventId;
      }

      if (!dayDivider) {
        dayDivider = prevEvent ? !inSameDay(prevEvent.getTs(), getEvtTs.call(mEvent)) : false;
      }

      const isMessageEvent = MESSAGE_EVENT_TYPES.includes(type);

      let collapsed = false;
      if (isPrevRendered && !dayDivider && prevEvent !== undefined) {
        const { getSender: getPrevSender, getType: getPrevType, getTs: getPrevTs } = prevEvent;

        if (isMessageEvent) {
          const withinTimeThreshold =
            minuteDifference(getPrevTs.call(prevEvent), getEvtTs.call(mEvent)) < 2;
          const senderMatch = getPrevSender.call(prevEvent) === eventSender;
          const typeMatch =
            normalizeMessageType(getPrevType.call(prevEvent)) === normalizeMessageType(type);
          const dividerOk = !newDivider || eventSender === mxUserId;
          const getPmpId = (ev: MatrixEvent): string | null =>
            ev.getContent()?.['com.beeper.per_message_profile']?.id ?? null;

          collapsed =
            dividerOk &&
            senderMatch &&
            typeMatch &&
            withinTimeThreshold &&
            getPmpId(prevEvent) === getPmpId(mEvent);
        } else {
          const prevIsMessageEvent = MESSAGE_EVENT_TYPES.includes(getPrevType.call(prevEvent));
          collapsed = !prevIsMessageEvent;
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

      // Reuse the previous ProcessedEvent object if all structural fields match,
      // so that React.memo on timeline item components can bail out cheaply.
      // itemIndex must also be equal: after back-pagination the same eventId
      // shifts to a higher VList index, so a stale itemIndex would break
      // getRawIndexToProcessedIndex and focus-highlight comparisons.
      const prev = prevCache?.get(mEventId);
      const stable =
        prev &&
        prev.mEvent === mEvent &&
        prev.timelineSet === timelineSet &&
        prev.itemIndex === processed.itemIndex &&
        prev.collapsed === collapsed &&
        prev.willRenderNewDivider === willRenderNewDivider &&
        prev.willRenderDayDivider === willRenderDayDivider &&
        prev.eventSender === eventSender
          ? prev
          : processed;

      prevEvent = mEvent;
      isPrevRendered = true;
      if (willRenderNewDivider) newDivider = false;
      if (willRenderDayDivider) dayDivider = false;

      acc.push(stable);
      return acc;
    }, []);
    // Update the stable-ref cache for the next render.
    stableRefsCache.current = new Map(result.map((e) => [e.id, e]));
    return result;
  }, [
    items,
    linkedTimelines,
    mutationVersion,
    ignoredUsersSet,
    showHiddenEvents,
    showTombstoneEvents,
    mxUserId,
    readUptoEventId,
    hideMembershipEvents,
    hideNickAvatarEvents,
    isReadOnly,
    hideMemberInReadOnly,
    skipThreadFilter,
  ]);
}
