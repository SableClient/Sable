/* oxlint-disable typescript/no-explicit-any */

import { describe, expect, it } from 'vitest';
import { EventType, RelationType } from '$types/matrix-sdk';
import { collectForumPosts } from './ForumView';

type EventInit = {
  id: string;
  ts: number;
  type?: string;
  content?: Record<string, unknown>;
  relation?: { rel_type?: string; event_id?: string };
  redacted?: boolean;
};

const makeEvent = ({
  id,
  ts,
  type = EventType.RoomMessage,
  content = { msgtype: 'm.text', body: id },
  relation,
  redacted = false,
}: EventInit) => ({
  getId: () => id,
  getTs: () => ts,
  getType: () => type,
  getContent: () => content,
  getRelation: () => relation ?? null,
  isRedacted: () => redacted,
  isState: () => false,
});

const makeRoom = ({
  threads = [],
  timelines = [[]],
}: {
  threads?: Array<{
    id: string;
    rootEvent: ReturnType<typeof makeEvent>;
    events: ReturnType<typeof makeEvent>[];
  }>;
  timelines?: Array<ReturnType<typeof makeEvent>[]>;
}) => ({
  getThreads: () => threads,
  getUnfilteredTimelineSet: () => ({
    getTimelines: () => timelines.map((events) => ({ getEvents: () => events })),
  }),
});

describe('collectForumPosts', () => {
  it('collects posts across linked timelines and excludes thread and legacy replies', () => {
    const root = makeEvent({ id: '$root', ts: 1 });
    const threadReply = makeEvent({
      id: '$thread-reply',
      ts: 3,
      relation: { rel_type: RelationType.Thread, event_id: '$root' },
    });
    const legacyReply = makeEvent({
      id: '$legacy-reply',
      ts: 4,
      content: {
        msgtype: 'm.text',
        body: 'reply',
        'm.relates_to': { ['m.in_reply_to']: { event_id: '$root' } },
      },
    });
    const olderPost = makeEvent({ id: '$older', ts: 2 });

    const posts = collectForumPosts(
      makeRoom({
        threads: [{ id: '$root', rootEvent: root, events: [root, threadReply] }],
        timelines: [
          [root, threadReply],
          [legacyReply, olderPost],
        ],
      }) as any
    );

    expect(posts.map((post) => post.eventId)).toEqual(['$root', '$older']);
  });

  it('keeps encrypted messages as forum posts', () => {
    const encryptedPost = makeEvent({
      id: '$encrypted',
      ts: 1,
      type: EventType.RoomMessageEncrypted,
      content: { algorithm: 'm.megolm.v1.aes-sha2' },
    });

    const posts = collectForumPosts(makeRoom({ timelines: [[encryptedPost]] }) as any);

    expect(posts.map((post) => post.eventId)).toEqual(['$encrypted']);
  });
});
