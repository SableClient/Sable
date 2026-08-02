import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { createClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { dedupeAnnotationsBySender, toggleReaction } from './reactions';

const USER = '@me:example.org';
const ROOM_ID = '!r:example.org';
const TARGET = '$target';
const KEY = '❤️';

type Harness = {
  mx: MatrixClient;
  room: Room;
  sends: () => number;
  redactions: () => string[];
  releaseSend: () => void;
};

/**
 * A client whose /send response is held back until releaseSend(), so a second
 * toggle can be made to land while the first reaction is still in flight.
 */
const makeHarness = (sendFailure?: { status: number; body: unknown }): Harness => {
  let sends = 0;
  const redactions: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const fetchFn = vi.fn<(url: unknown) => Promise<Response>>(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/redact/')) {
      redactions.push(decodeURIComponent(u.split('/redact/')[1]!.split('/')[0]!));
      return new Response(JSON.stringify({ event_id: '$redaction' }), { status: 200 });
    }
    if (u.includes('/send/')) {
      sends += 1;
      await gate;
      if (sendFailure) {
        return new Response(JSON.stringify(sendFailure.body), {
          status: sendFailure.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ event_id: `$sent${sends}` }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });

  const mx = createClient({
    baseUrl: 'https://hs.example.org',
    userId: USER,
    accessToken: 't',
    deviceId: 'D',
    fetchFn: fetchFn as never,
  });

  const room = new Room(ROOM_ID, mx, USER, { timelineSupport: true });
  room.addLiveEvents(
    [
      new MatrixEvent({
        type: 'm.room.message',
        event_id: TARGET,
        room_id: ROOM_ID,
        sender: '@other:example.org',
        origin_server_ts: 1,
        content: { msgtype: 'm.text', body: 'hi' },
      }),
    ],
    { addToState: false }
  );
  mx.store.storeRoom(room);

  return { mx, room, sends: () => sends, redactions: () => redactions, releaseSend: release };
};

const addRemoteReactions = (room: Room, events: { eventId: string; sender: string }[]) =>
  room.addLiveEvents(
    events.map(
      ({ eventId, sender }, index) =>
        new MatrixEvent({
          type: 'm.reaction',
          event_id: eventId,
          room_id: ROOM_ID,
          sender,
          origin_server_ts: 2 + index,
          content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: TARGET, key: KEY } },
        })
    ),
    { addToState: false }
  );

describe('dedupeAnnotationsBySender', () => {
  const annotation = (eventId: string, sender: string) =>
    new MatrixEvent({
      type: 'm.reaction',
      event_id: eventId,
      room_id: ROOM_ID,
      sender,
      content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: TARGET, key: KEY } },
    });

  it('counts repeats from one sender once, keeping the earliest', () => {
    const deduped = dedupeAnnotationsBySender([
      annotation('$a1', '@a:example.org'),
      annotation('$b1', '@b:example.org'),
      annotation('$a2', '@a:example.org'),
    ]);

    expect(deduped.map((mEvent) => mEvent.getId())).toEqual(['$a1', '$b1']);
  });
});

describe('toggleReaction', () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  it('sends the reaction when there is none yet', async () => {
    const toggling = toggleReaction(h.mx, h.room, TARGET, KEY);
    h.releaseSend();
    await toggling;

    expect(h.sends()).toBe(1);
    expect(h.redactions()).toEqual([]);
  });

  it('redacts an existing reaction of ours instead of sending another', async () => {
    const first = toggleReaction(h.mx, h.room, TARGET, KEY);
    h.releaseSend();
    await first;

    await toggleReaction(h.mx, h.room, TARGET, KEY);

    expect(h.sends()).toBe(1);
    expect(h.redactions()).toEqual(['$sent1']);
  });

  it('ignores a toggle made while the first one is still in flight', async () => {
    const first = toggleReaction(h.mx, h.room, TARGET, KEY);
    const second = toggleReaction(h.mx, h.room, TARGET, KEY);

    h.releaseSend();
    await Promise.all([first, second]);

    expect(h.sends()).toBe(1);
    expect(h.redactions()).toEqual([]);
  });

  it('sends a single reaction when the button is mashed', async () => {
    const clicks = Array.from({ length: 10 }, () => toggleReaction(h.mx, h.room, TARGET, KEY));
    h.releaseSend();
    await Promise.all(clicks);

    expect(h.sends()).toBe(1);
    expect(h.redactions()).toEqual([]);
  });

  it('removes the reaction on the next toggle after the send settles', async () => {
    const clicks = Array.from({ length: 10 }, () => toggleReaction(h.mx, h.room, TARGET, KEY));
    h.releaseSend();
    await Promise.all(clicks);

    await toggleReaction(h.mx, h.room, TARGET, KEY);

    expect(h.sends()).toBe(1);
    expect(h.redactions()).toEqual(['$sent1']);
  });

  it('redacts every duplicate of ours, so the reaction stops being counted', async () => {
    addRemoteReactions(h.room, [
      { eventId: '$dup1', sender: USER },
      { eventId: '$dup2', sender: USER },
      { eventId: '$other', sender: '@other:example.org' },
    ]);

    await toggleReaction(h.mx, h.room, TARGET, KEY);

    expect(h.sends()).toBe(0);
    expect(h.redactions().toSorted()).toEqual(['$dup1', '$dup2']);
  });

  it('accepts a server that rejects the send as a duplicate annotation', async () => {
    const failing = makeHarness({
      status: 400,
      body: { errcode: 'M_DUPLICATE_ANNOTATION', error: 'Duplicate annotation' },
    });

    const toggling = toggleReaction(failing.mx, failing.room, TARGET, KEY);
    failing.releaseSend();

    await expect(toggling).resolves.toBeUndefined();
  });

  it('keeps reactions with different keys independent', async () => {
    const toggling = Promise.all([
      toggleReaction(h.mx, h.room, TARGET, KEY),
      toggleReaction(h.mx, h.room, TARGET, '🫀'),
    ]);
    h.releaseSend();
    await toggling;

    expect(h.sends()).toBe(2);
    expect(h.redactions()).toEqual([]);
  });
});
