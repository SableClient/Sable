import type { EventTimeline, MatrixEvent, Room } from '$types/matrix-sdk';
import { Direction } from '$types/matrix-sdk';
import { roomHaveNotification, roomHaveUnread } from '$utils/room/unread';

export const PAGINATION_LIMIT = 60;

export const getLiveTimeline = (room: Room): EventTimeline =>
  room.getUnfilteredTimelineSet().getLiveTimeline();

/** True when `eventId` is the newest event the live timeline holds. */
export const isNewestLiveEvent = (room: Room, eventId: string): boolean => {
  const events = getLiveTimeline(room).getEvents?.() ?? [];
  return events[events.length - 1]?.getId?.() === eventId;
};

export const getEventTimeline = (room: Room, eventId: string): EventTimeline | undefined => {
  const timelineSet = room.getUnfilteredTimelineSet();
  return timelineSet.getTimelineForEvent(eventId) ?? undefined;
};

/** Resolves against the displayed chain's own set, which for a jump is not the room's. */
export const getDisplayedEventTimeline = (
  linkedTimelines: EventTimeline[],
  eventId: string
): EventTimeline | undefined =>
  linkedTimelines[0]?.getTimelineSet().getTimelineForEvent(eventId) ?? undefined;

export const getFirstLinkedTimeline = (
  timeline: EventTimeline,
  direction: Direction
): EventTimeline => {
  let current = timeline;
  while (current.getNeighbouringTimeline(direction)) {
    current = current.getNeighbouringTimeline(direction)!;
  }
  return current;
};

export const getLinkedTimelines = (timeline: EventTimeline): EventTimeline[] => {
  const result: EventTimeline[] = [];
  let current: EventTimeline | null = getFirstLinkedTimeline(timeline, Direction.Backward);
  while (current) {
    result.push(current);
    current = current.getNeighbouringTimeline(Direction.Forward);
  }
  return result;
};

const timelineToEventsCount = (t: EventTimeline) => {
  if (!t) return 0;
  const events = t.getEvents();
  return events ? events.length : 0;
};

export const getTimelinesEventsCount = (timelines: EventTimeline[]): number => {
  const timelineEventCountReducer = (count: number, tm: EventTimeline) =>
    count + timelineToEventsCount(tm);
  return (timelines || [])
    .filter(Boolean)
    .reduce((accumulator, element) => timelineEventCountReducer(accumulator, element), 0);
};

export const getEventIdAbsoluteIndex = (
  timelines: EventTimeline[],
  eventTimeline: EventTimeline,
  eventId: string
): number | undefined => {
  const timelineIndex = timelines.indexOf(eventTimeline);
  if (timelineIndex === -1) return undefined;

  const currentEvents = eventTimeline.getEvents();
  if (!currentEvents) return undefined;

  const eventIndex = currentEvents.findIndex((evt: MatrixEvent) => evt.getId() === eventId);
  if (eventIndex === -1) return undefined;

  const baseIndex = timelines.slice(0, timelineIndex).reduce((accValue, timeline) => {
    const evs = timeline.getEvents();
    return (evs ? evs.length : 0) + accValue;
  }, 0);

  return baseIndex + eventIndex;
};

export const getInitialTimeline = (room: Room) => {
  const linkedTimelines = getLinkedTimelines(getLiveTimeline(room));
  const evLength = getTimelinesEventsCount(linkedTimelines);
  return {
    linkedTimelines,
    range: {
      start: Math.max(evLength - PAGINATION_LIMIT, 0),
      end: evLength,
    },
  };
};

export const getEmptyTimeline = () => ({
  range: { start: 0, end: 0 },
  linkedTimelines: [],
});

export const getRoomUnreadInfo = (room: Room, scrollTo = false) => {
  if (!roomHaveNotification(room) && !roomHaveUnread(room.client, room)) return undefined;

  const readUptoEventId = room.getEventReadUpTo(room.client.getUserId() ?? '');
  if (!readUptoEventId) return undefined;

  const evtTimeline = getEventTimeline(room, readUptoEventId);

  if (!evtTimeline) {
    return {
      readUptoEventId,
      inLiveTimeline: false,
      scrollTo,
    };
  }

  const latestTimeline = getFirstLinkedTimeline(evtTimeline, Direction.Forward);
  return {
    readUptoEventId,
    inLiveTimeline: latestTimeline === room.getLiveTimeline(),
    scrollTo,
  };
};
