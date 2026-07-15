import { describe, expect, it } from 'vitest';
import { EventType, RelationType } from '$types/matrix-sdk';
import type { EventTimelineSet, MatrixEvent, Room } from '$types/matrix-sdk';
import { extractReplyDraftBody, findRoomEventById, resolveReplyDraftTarget } from './room';

/* oxlint-disable typescript/no-explicit-any */

const createMessageEvent = (id: string, body: string, sender = '@alice:example.com') =>
  ({
    getId: () => id,
    getType: () => EventType.RoomMessage,
    getSender: () => sender,
    getContent: () => ({ body, msgtype: 'm.text' }),
    getWireContent: () => ({ body, msgtype: 'm.text' }),
    getRelation: () => undefined,
    isRedaction: () => false,
    isRedacted: () => false,
  }) as unknown as MatrixEvent;

const createReactionEvent = (id: string, targetId: string) =>
  ({
    getId: () => id,
    getType: () => EventType.Reaction,
    getSender: () => '@bob:example.com',
    getContent: () => ({
      'm.relates_to': {
        rel_type: RelationType.Annotation,
        event_id: targetId,
        key: '👍',
      },
    }),
    getWireContent: () => ({
      'm.relates_to': {
        rel_type: RelationType.Annotation,
        event_id: targetId,
        key: '👍',
      },
    }),
    getRelation: () => ({
      rel_type: RelationType.Annotation,
      event_id: targetId,
      key: '👍',
    }),
    isRedaction: () => false,
    isRedacted: () => false,
  }) as unknown as MatrixEvent;

const createEditEvent = (id: string, targetId: string, newBody: string) =>
  ({
    getId: () => id,
    getType: () => EventType.RoomMessage,
    getSender: () => '@alice:example.com',
    getContent: () => ({
      'm.new_content': { body: newBody, msgtype: 'm.text' },
      'm.relates_to': {
        rel_type: RelationType.Replace,
        event_id: targetId,
      },
    }),
    getWireContent: () => ({
      'm.new_content': { body: newBody, msgtype: 'm.text' },
      'm.relates_to': {
        rel_type: RelationType.Replace,
        event_id: targetId,
      },
    }),
    getRelation: () => ({
      rel_type: RelationType.Replace,
      event_id: targetId,
    }),
    isRedaction: () => false,
    isRedacted: () => false,
  }) as unknown as MatrixEvent;

const createTimelineSet = (
  events: Record<string, MatrixEvent>,
  relations: Record<string, MatrixEvent[]> = {}
) => {
  const parents = Object.values(events).filter(
    (event) => event.getType() === EventType.RoomMessage
  );

  return {
    findEventById: (id: string) => events[id],
    getTimelines: () => [{ getEvents: () => parents }],
    relations: {
      getChildEventsForEvent: (eventId: string, relType: string, eventType: string) => {
        const key = `${eventId}:${relType}:${eventType}`;
        const relEvents = relations[key] ?? [];
        return {
          getRelations: () => relEvents,
        };
      },
    },
  } as unknown as EventTimelineSet;
};

describe('findRoomEventById', () => {
  it('finds relation-only events via timeline relations', () => {
    const message = createMessageEvent('$msg', 'hello');
    const reaction = createReactionEvent('$reaction', '$msg');
    const timelineSet = createTimelineSet(
      { $msg: message },
      {
        [`$msg:${RelationType.Annotation}:${EventType.Reaction}`]: [reaction],
      }
    );

    const room = {
      findEventById: () => undefined,
      getUnfilteredTimelineSet: () => timelineSet,
    } as unknown as Room;

    expect(findRoomEventById(room, '$reaction', timelineSet)?.getId()).toBe('$reaction');
  });
});

describe('resolveReplyDraftTarget', () => {
  it('keeps reaction replies on the reaction event', () => {
    const message = createMessageEvent('$msg', 'hello there');
    const reaction = createReactionEvent('$reaction', '$msg');
    const timelineSet = createTimelineSet(
      { $msg: message },
      {
        [`$msg:${RelationType.Annotation}:${EventType.Reaction}`]: [reaction],
      }
    );

    const room = {
      findEventById: (id: string) => (id === '$msg' ? message : undefined),
      getUnfilteredTimelineSet: () => timelineSet,
    } as unknown as Room;

    const resolved = resolveReplyDraftTarget(room, '$reaction', timelineSet);
    expect(resolved?.eventId).toBe('$reaction');
    expect(resolved?.replyEvt.getId()).toBe('$reaction');

    const { body } = extractReplyDraftBody(resolved!.replyEvt, timelineSet);
    expect(body).toBe('');
  });

  it('keeps edit replies on the edit event with edited body text', () => {
    const message = createMessageEvent('$msg', 'hello there');
    const edit = createEditEvent('$edit', '$msg', 'hello edited');
    const timelineSet = createTimelineSet(
      { $msg: message },
      {
        [`$msg:${RelationType.Replace}:${EventType.RoomMessage}`]: [edit],
      }
    );

    const room = {
      findEventById: (id: string) => {
        if (id === '$msg') return message;
        if (id === '$edit') return edit;
        return undefined;
      },
      getUnfilteredTimelineSet: () => timelineSet,
    } as unknown as Room;

    const resolved = resolveReplyDraftTarget(room, '$edit', timelineSet);
    expect(resolved?.eventId).toBe('$edit');
    expect(resolved?.replyEvt.getId()).toBe('$edit');

    const { body } = extractReplyDraftBody(resolved!.replyEvt, timelineSet);
    expect(body).toBe('hello edited');
  });
});
