import type { MatrixClient, MatrixEvent, Room, TimelineEvents } from '$types/matrix-sdk';
import { EventType, MatrixError } from '$types/matrix-sdk';
import { factoryEventSentBy, eventWithShortcode } from '$utils/matrix';
import { getReactionContent } from '$utils/messageReaction';
import { getEventReactions } from './relations';
import { redactOrCancelEvent } from './redaction';

// Duplicates reach us over federation even though servers reject them locally, and the
// spec counts repeats from one sender as a single annotation.
export const dedupeAnnotationsBySender = (events: Iterable<MatrixEvent>): MatrixEvent[] => {
  const bySender = new Map<string, MatrixEvent>();
  for (const mEvent of events) {
    const sender = mEvent.getSender();
    if (sender && !bySender.has(sender)) bySender.set(sender, mEvent);
  }
  return [...bySender.values()];
};

// Add vs remove is read from the relation aggregation, which only catches up once the
// sent event is acknowledged, so a click landing before then would add a duplicate.
const runningToggles = new Map<string, Promise<void>>();

const toggleKey = (roomId: string, targetEventId: string, key: string) =>
  `${roomId}|${targetEventId}|${key}`;

const runToggle = async (
  mx: MatrixClient,
  room: Room,
  targetEventId: string,
  key: string,
  shortcode?: string
): Promise<void> => {
  const relations = getEventReactions(room.getUnfilteredTimelineSet(), targetEventId);
  const allReactions = relations?.getSortedAnnotationsByKey() ?? [];
  const [, reactionsSet] = allReactions.find(([k]) => k === key) ?? [];
  const reactions = reactionsSet ? Array.from(reactionsSet) : [];

  const myReactions = reactions
    .filter(factoryEventSentBy(mx.getSafeUserId()))
    .filter((mEvent) => mEvent.isRelation());
  if (myReactions.length > 0) {
    // Redact every duplicate, not just one, or the reaction stays counted.
    await Promise.all(myReactions.map((mEvent) => redactOrCancelEvent(mx, mEvent)));
    return;
  }

  const rShortcode =
    shortcode || (reactions.find(eventWithShortcode)?.getContent().shortcode as string | undefined);

  try {
    await mx.sendEvent(
      room.roomId,
      EventType.Reaction as string as unknown as keyof TimelineEvents,
      getReactionContent(
        targetEventId,
        key,
        mx,
        room,
        rShortcode
      ) as TimelineEvents[keyof TimelineEvents]
    );
  } catch (err) {
    // The reaction the server refused as a duplicate is the one we wanted there.
    if (!(err instanceof MatrixError && err.errcode === 'M_DUPLICATE_ANNOTATION')) throw err;
  }
};

export const toggleReaction = (
  mx: MatrixClient,
  room: Room,
  targetEventId: string,
  key: string,
  shortcode?: string
): Promise<void> => {
  const flightKey = toggleKey(room.roomId, targetEventId, key);
  const running = runningToggles.get(flightKey);
  if (running) return running;

  const toggle = runToggle(mx, room, targetEventId, key, shortcode).finally(() => {
    runningToggles.delete(flightKey);
  });
  runningToggles.set(flightKey, toggle);
  return toggle;
};
