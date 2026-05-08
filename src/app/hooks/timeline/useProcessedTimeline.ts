import { useMemo } from 'react';
import type { MatrixEvent, EventTimelineSet, EventTimeline } from '$types/matrix-sdk';
import {
  getTimelineAndBaseIndex,
  getTimelineRelativeIndex,
  getTimelineEvent,
} from '$utils/timeline';
import { isMembershipChanged, isThreadRelationEvent, reactionOrEditEvent } from '$utils/room';
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

const getPmpId = (ev: MatrixEvent): string | null =>
  ev.getContent()?.['com.beeper.per_message_profile']?.id ?? null;

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
}: UseProcessedTimelineOptions): ProcessedEvent[] {
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
      if (mEvent.isRedacted() && !(showHiddenEvents || showTombstoneEvents)) return acc;

      const type = mEvent.getType();

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

      if (
        !skipThreadFilter &&
        threadRootId !== undefined &&
        threadRootId !== mEventId &&
        isThreadRelationEvent(mEvent, threadRootId)
      )
        return acc;

      const isReactionOrEdit = reactionOrEditEvent(mEvent);
      if (isReactionOrEdit) return acc;

      if (!newDivider && readUptoEventId) {
        const prevId = prevEvent ? prevEvent.getId() : undefined;
        newDivider = prevId === readUptoEventId;
      }

      if (!dayDivider) {
        dayDivider = prevEvent ? !inSameDay(prevEvent.getTs(), mEvent.getTs()) : false;
      }

      const isMessageEvent = MESSAGE_EVENT_TYPES.has(type);

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
            senderMatch &&
            typeMatch &&
            withinTimeThreshold &&
            getPmpId(prevEvent) === getPmpId(mEvent);
        } else {
          const prevIsMessageEvent = MESSAGE_EVENT_TYPES.has(prevEvent.getType());
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

      prevEvent = mEvent;
      isPrevRendered = true;
      if (willRenderNewDivider) newDivider = false;
      if (willRenderDayDivider) dayDivider = false;

      acc.push(processed);
      return acc;
    }, []);
    return result;
  }, [
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
  ]);
}
