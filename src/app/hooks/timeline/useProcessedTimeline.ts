import { useMemo } from 'react';
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

      // Poll response and end events are always filtered — they update the poll tally
      // via RoomEvent.Timeline listeners in PollEvent and must never render as timeline items.
      // Also check the effective (decrypted) type for encrypted events that have been decrypted.
      const effectiveType =
        type === 'm.room.encrypted'
          ? ((mEvent.getEffectiveEvent()?.type as string) ?? type)
          : type;
      if (
        effectiveType === 'org.matrix.msc3381.poll.response' ||
        effectiveType === 'org.matrix.msc3381.poll.end' ||
        effectiveType === 'm.poll.response' ||
        effectiveType === 'm.poll.end'
      )
        return acc;

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
          'org.matrix.msc3381.poll.start',
          'm.poll.start',
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
