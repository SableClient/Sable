import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stripReplyFallback,
  eventToPreviewText,
  getLastMessageText,
  useRoomLastMessage,
} from './useRoomLastMessage';

// -------- helpers --------

function makeEvent(overrides: {
  type?: string;
  content?: Record<string, unknown>;
  sender?: string;
  roomId?: string;
  redacted?: boolean;
  effectiveType?: string;
  encrypted?: boolean;
}) {
  const type = overrides.type ?? 'm.room.message';
  const content = overrides.content ?? { msgtype: 'm.text', body: 'hello' };
  return {
    getType: () => type,
    getContent: () => content,
    getSender: () => overrides.sender ?? '@alice:test',
    getRoomId: () => overrides.roomId ?? '!room:test',
    isRedacted: () => overrides.redacted ?? false,
    isEncrypted: () => overrides.encrypted ?? false,
    getEffectiveEvent: () => ({ type: overrides.effectiveType ?? type, content }),
  } as never;
}

// -------- stripReplyFallback --------

describe('stripReplyFallback', () => {
  it('returns the body unchanged when there is no fallback', () => {
    expect(stripReplyFallback('hello world')).toBe('hello world');
  });

  it('strips lines starting with > and the blank separator', () => {
    const body = '> reply line 1\n> reply line 2\n\nactual message';
    expect(stripReplyFallback(body)).toBe('actual message');
  });

  it('strips fallback with no separator line', () => {
    const body = '> quoted\nrest';
    expect(stripReplyFallback(body)).toBe('rest');
  });

  it('returns empty string when the entire body is a fallback', () => {
    expect(stripReplyFallback('> only quote\n')).toBe('');
  });

  it('handles multi-line actual message after fallback', () => {
    const body = '> quote\n\nline 1\nline 2';
    expect(stripReplyFallback(body)).toBe('line 1\nline 2');
  });
});

// -------- eventToPreviewText --------

describe('eventToPreviewText', () => {
  it('returns body for m.text message', () => {
    const ev = makeEvent({ content: { msgtype: 'm.text', body: 'hi' } });
    expect(eventToPreviewText(ev)).toBe('hi');
  });

  it('returns body for m.emote message', () => {
    const ev = makeEvent({ content: { msgtype: 'm.emote', body: 'waves' } });
    expect(eventToPreviewText(ev)).toBe('waves');
  });

  it('returns body for m.notice message', () => {
    const ev = makeEvent({ content: { msgtype: 'm.notice', body: 'notice' } });
    expect(eventToPreviewText(ev)).toBe('notice');
  });

  it('returns image icon for m.image', () => {
    const ev = makeEvent({ content: { msgtype: 'm.image', body: 'photo.png' } });
    expect(eventToPreviewText(ev)).toBe('📷 Image');
  });

  it('returns video icon for m.video', () => {
    const ev = makeEvent({ content: { msgtype: 'm.video', body: 'clip.mp4' } });
    expect(eventToPreviewText(ev)).toBe('📹 Video');
  });

  it('returns audio icon for m.audio', () => {
    const ev = makeEvent({ content: { msgtype: 'm.audio', body: 'song.mp3' } });
    expect(eventToPreviewText(ev)).toBe('🎵 Audio');
  });

  it('returns file icon for m.file', () => {
    const ev = makeEvent({ content: { msgtype: 'm.file', body: 'doc.pdf' } });
    expect(eventToPreviewText(ev)).toBe('📎 File');
  });

  it('returns encrypted placeholder for encrypted events', () => {
    const ev = makeEvent({ type: 'm.room.encrypted', content: {} });
    expect(eventToPreviewText(ev)).toBe('🔒 Encrypted message');
  });

  it('returns decrypted content when event has been decrypted', () => {
    const ev = makeEvent({
      type: 'm.room.encrypted',
      content: { msgtype: 'm.text', body: 'decrypted text' },
      effectiveType: 'm.room.message',
    });
    expect(eventToPreviewText(ev)).toBe('decrypted text');
  });

  it('returns sticker text', () => {
    const ev = makeEvent({ type: 'm.sticker', content: { body: 'party' } });
    expect(eventToPreviewText(ev)).toBe('🎉 party');
  });

  it('returns undefined for redacted events', () => {
    const ev = makeEvent({ redacted: true });
    expect(eventToPreviewText(ev)).toBeUndefined();
  });

  it('returns undefined for reaction events', () => {
    const ev = makeEvent({ type: 'm.reaction', content: {} });
    expect(eventToPreviewText(ev)).toBeUndefined();
  });

  it('returns undefined for edit events (m.replace)', () => {
    const ev = makeEvent({
      content: {
        msgtype: 'm.text',
        body: 'edited',
        'm.relates_to': { rel_type: 'm.replace', event_id: '$orig' },
      },
    });
    expect(eventToPreviewText(ev)).toBeUndefined();
  });

  it('strips reply fallback from text body', () => {
    const ev = makeEvent({
      content: { msgtype: 'm.text', body: '> quoted\n\nreal message' },
    });
    expect(eventToPreviewText(ev)).toBe('real message');
  });

  it('returns poll text for MSC3381 poll start events', () => {
    const ev = makeEvent({
      type: 'org.matrix.msc3381.poll.start',
      content: { 'org.matrix.msc3381.poll.start': { question: { body: 'Lunch?' } } },
    });
    expect(eventToPreviewText(ev)).toBe('📊 Lunch?');
  });

  it('returns poll text for stable poll start events', () => {
    const ev = makeEvent({
      type: 'm.poll.start',
      content: { 'm.poll.start': { question: { body: 'Dinner?' } } },
    });
    expect(eventToPreviewText(ev)).toBe('📊 Dinner?');
  });

  it('returns location icon for m.location message', () => {
    const ev = makeEvent({ content: { msgtype: 'm.location', body: 'geo:0,0' } });
    expect(eventToPreviewText(ev)).toBe('📍 Location');
  });

  it('returns undefined for unknown event types', () => {
    const ev = makeEvent({ type: 'm.room.power_levels', content: {} });
    expect(eventToPreviewText(ev)).toBeUndefined();
  });
});

// -------- getLastMessageText --------

describe('getLastMessageText', () => {
  const makeMx = (userId = '@alice:test') => ({ getUserId: () => userId }) as never;

  const makeRoom = (events: ReturnType<typeof makeEvent>[], members?: Record<string, string>) =>
    ({
      roomId: '!room:test',
      getLiveTimeline: () => ({
        getEvents: () => events,
      }),
      getMember: (id: string) => (members?.[id] ? { name: members[id] } : null),
    }) as never;

  it('returns "You: text" when the sender is the current user', () => {
    const ev = makeEvent({ sender: '@alice:test', content: { msgtype: 'm.text', body: 'hi' } });
    expect(getLastMessageText(makeRoom([ev]), makeMx())).toBe('You: hi');
  });

  it('returns "DisplayName: text" for another user', () => {
    const ev = makeEvent({ sender: '@bob:test', content: { msgtype: 'm.text', body: 'hey' } });
    const room = makeRoom([ev], { '@bob:test': 'Bob' });
    expect(getLastMessageText(room, makeMx())).toBe('Bob: hey');
  });

  it('falls back to localpart when no display name is available', () => {
    const ev = makeEvent({ sender: '@bob:test', content: { msgtype: 'm.text', body: 'hey' } });
    const room = makeRoom([ev]);
    expect(getLastMessageText(room, makeMx())).toBe('bob: hey');
  });

  it('skips reactions and picks the last real message', () => {
    const msg = makeEvent({ content: { msgtype: 'm.text', body: 'real' } });
    const reaction = makeEvent({ type: 'm.reaction', content: {} });
    expect(getLastMessageText(makeRoom([msg, reaction]), makeMx())).toBe('You: real');
  });

  it('returns undefined when there are no displayable events', () => {
    const reaction = makeEvent({ type: 'm.reaction', content: {} });
    expect(getLastMessageText(makeRoom([reaction]), makeMx())).toBeUndefined();
  });

  it('returns undefined for an empty timeline', () => {
    expect(getLastMessageText(makeRoom([]), makeMx())).toBeUndefined();
  });
});

// -------- useRoomLastMessage hook --------

describe('useRoomLastMessage', () => {
  const makeMx = (userId = '@alice:test') => ({
    getUserId: () => userId,
    on: vi.fn(),
    off: vi.fn(),
  });

  const roomListeners = new Map<string, ((...args: unknown[]) => void)[]>();

  const makeRoom = (events: ReturnType<typeof makeEvent>[]) => ({
    roomId: '!room:test',
    getLiveTimeline: () => ({ getEvents: () => events }),
    getMember: () => null,
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      const list = roomListeners.get(event) ?? [];
      list.push(handler);
      roomListeners.set(event, list);
    }),
    off: vi.fn(),
  });

  beforeEach(() => {
    roomListeners.clear();
  });

  it('returns undefined when room is undefined', () => {
    const mx = makeMx();
    const { result } = renderHook(() => useRoomLastMessage(undefined, mx as never));
    expect(result.current).toBeUndefined();
  });

  it('returns the last message preview on mount', () => {
    const ev = makeEvent({ content: { msgtype: 'm.text', body: 'hello' } });
    const room = makeRoom([ev]);
    const mx = makeMx();
    const { result } = renderHook(() => useRoomLastMessage(room as never, mx as never));
    expect(result.current).toBe('You: hello');
  });

  it('updates when a Timeline event fires', () => {
    const ev1 = makeEvent({ content: { msgtype: 'm.text', body: 'first' } });
    const events = [ev1];
    const room = makeRoom(events);
    const mx = makeMx();

    const { result } = renderHook(() => useRoomLastMessage(room as never, mx as never));
    expect(result.current).toBe('You: first');

    // Simulate a new message arriving.
    const ev2 = makeEvent({ content: { msgtype: 'm.text', body: 'second' } });
    events.push(ev2);

    const timelineHandlers = roomListeners.get('Room.timeline') ?? [];
    act(() => {
      timelineHandlers.forEach((h) => h());
    });

    expect(result.current).toBe('You: second');
  });
});
