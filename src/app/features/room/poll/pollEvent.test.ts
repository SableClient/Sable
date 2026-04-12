import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Room, MatrixEvent } from '$types/matrix-sdk';
import { extractPollData, extractVoteSelections, computeTally, formatExpiry } from './PollEvent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POLL_CREATOR = '@creator:test';
const MY_USER_ID = '@me:test';

/**
 * Build a fake MatrixEvent that looks like an `m.poll.start` event.
 */
function makePollStartEvent(
  id: string,
  opts: {
    question?: string;
    answers?: { id: string; text: string }[];
    maxSelections?: number;
    kind?: string;
    closesAt?: number;
    showVoterNames?: boolean;
    /** Use unstable (org.matrix) keys if true (default false → stable m.poll.start) */
    unstable?: boolean;
  } = {}
): MatrixEvent {
  const {
    question = 'Favourite colour?',
    answers = [
      { id: 'ans-red', text: 'Red' },
      { id: 'ans-blue', text: 'Blue' },
    ],
    maxSelections = 1,
    kind = 'm.poll.disclosed',
    closesAt,
    showVoterNames = true,
    unstable = false,
  } = opts;

  const rawAnswers = answers.map((a) => ({
    'm.id': a.id,
    'm.text': [{ body: a.text }],
  }));
  const pollStartKey = unstable ? 'org.matrix.msc3381.poll.start' : 'm.poll.start';

  const content: Record<string, unknown> = {
    [pollStartKey]: {
      question: { 'm.text': [{ body: question }] },
      answers: rawAnswers,
      max_selections: maxSelections,
      kind,
      show_voter_names: showVoterNames,
      ...(closesAt != null ? { closes_at: closesAt } : {}),
    },
  };

  return {
    getId: () => id,
    getSender: () => POLL_CREATOR,
    getType: () => (unstable ? 'org.matrix.msc3381.poll.start' : 'm.poll.start'),
    getContent: () => content,
    getTs: () => 1_000,
  } as unknown as MatrixEvent;
}

/**
 * Build a fake poll-response MatrixEvent.
 */
function makeResponseEvent(
  sender: string,
  selections: string[],
  ts: number,
  isDecryptionFailure = false
): MatrixEvent {
  return {
    getId: () => `${sender}-${ts}`,
    getSender: () => sender,
    getType: () => 'm.poll.response',
    getTs: () => ts,
    getContent: () => ({ 'm.selections': selections }),
    isDecryptionFailure: () => isDecryptionFailure,
  } as unknown as MatrixEvent;
}

/**
 * Build a fake poll-end MatrixEvent.
 */
function makeEndEvent(sender: string, ts: number): MatrixEvent {
  return {
    getId: () => `end-${ts}`,
    getSender: () => sender,
    getType: () => 'm.poll.end',
    getTs: () => ts,
    getContent: () => ({}),
    isDecryptionFailure: () => false,
  } as unknown as MatrixEvent;
}

/**
 * Build a minimal fake Room whose `relations.getAllChildEventsForEvent` returns
 * the provided child events.
 */
function makeRoom(childEvents: MatrixEvent[], maySendRedaction = false): Room {
  return {
    getUnfilteredTimelineSet: () => ({
      relations: {
        getAllChildEventsForEvent: (_id: string) => childEvents,
      },
    }),
    currentState: {
      maySendRedactionForEvent: (_event: MatrixEvent, _sender: string) => maySendRedaction,
    },
  } as unknown as Room;
}

// ---------------------------------------------------------------------------
// extractPollData
// ---------------------------------------------------------------------------

describe('extractPollData', () => {
  it('parses a stable (m.poll.start) event', () => {
    const ev = makePollStartEvent('$poll:test');
    const data = extractPollData(ev);
    expect(data).not.toBeNull();
    expect(data?.question).toBe('Favourite colour?');
    expect(data?.answers).toHaveLength(2);
    expect(data?.answers[0]).toEqual({ id: 'ans-red', text: 'Red' });
    expect(data?.maxSelections).toBe(1);
    expect(data?.isDisclosed).toBe(true);
    expect(data?.showVoterNames).toBe(true);
    expect(data?.closesAt).toBeUndefined();
  });

  it('parses an unstable (org.matrix.msc3381) event', () => {
    const ev = makePollStartEvent('$poll:test', { unstable: true });
    const data = extractPollData(ev);
    expect(data?.question).toBe('Favourite colour?');
    expect(data?.isDisclosed).toBe(true);
  });

  it('returns null when there is no poll payload', () => {
    const ev = {
      getContent: () => ({}),
    } as unknown as MatrixEvent;
    expect(extractPollData(ev)).toBeNull();
  });

  it('caps answers to 20 even if more are provided', () => {
    const tooManyAnswers = Array.from({ length: 25 }, (_, i) => ({
      id: `a${i}`,
      text: `Answer ${i}`,
    }));
    const ev = makePollStartEvent('$poll:test', { answers: tooManyAnswers });
    const data = extractPollData(ev);
    expect(data?.answers).toHaveLength(20);
  });

  it('defaults maxSelections to 1 when not a positive integer', () => {
    const ev = makePollStartEvent('$poll:test', { maxSelections: 0 });
    expect(extractPollData(ev)?.maxSelections).toBe(1);
  });

  it('parses closesAt when present', () => {
    const future = Date.now() + 3_600_000;
    const ev = makePollStartEvent('$poll:test', { closesAt: future });
    expect(extractPollData(ev)?.closesAt).toBe(future);
  });

  it('treats m.poll.disclosed kind as isDisclosed=true', () => {
    const ev = makePollStartEvent('$poll:test', { kind: 'm.poll.disclosed' });
    expect(extractPollData(ev)?.isDisclosed).toBe(true);
  });

  it('treats m.poll.undisclosed kind as isDisclosed=false', () => {
    const ev = makePollStartEvent('$poll:test', { kind: 'm.poll.undisclosed' });
    expect(extractPollData(ev)?.isDisclosed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractVoteSelections
// ---------------------------------------------------------------------------

describe('extractVoteSelections', () => {
  it('returns stable m.selections array', () => {
    const ev = {
      getContent: () => ({ 'm.selections': ['ans-red'] }),
    } as unknown as MatrixEvent;
    expect(extractVoteSelections(ev)).toEqual(['ans-red']);
  });

  it('falls back to unstable org.matrix.msc3381.poll.response.answers', () => {
    const ev = {
      getContent: () => ({
        'org.matrix.msc3381.poll.response': { answers: ['ans-blue'] },
      }),
    } as unknown as MatrixEvent;
    expect(extractVoteSelections(ev)).toEqual(['ans-blue']);
  });

  it('returns [] when the content has no selections field', () => {
    const ev = { getContent: () => ({}) } as unknown as MatrixEvent;
    expect(extractVoteSelections(ev)).toEqual([]);
  });

  it('filters out non-string values from selections array', () => {
    const ev = {
      getContent: () => ({ 'm.selections': ['valid', 42, null, 'also-valid'] }),
    } as unknown as MatrixEvent;
    expect(extractVoteSelections(ev)).toEqual(['valid', 'also-valid']);
  });
});

// ---------------------------------------------------------------------------
// computeTally
// ---------------------------------------------------------------------------

describe('computeTally', () => {
  const ANSWERS = [
    { id: 'ans-red', text: 'Red' },
    { id: 'ans-blue', text: 'Blue' },
  ];

  it('correctly tallies a single vote', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const children = [makeResponseEvent('@alice:test', ['ans-red'], 2_000)];
    const room = makeRoom(children);

    const { tally, isEnded } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(isEnded).toBe(false);
    expect(tally.get('ans-red')?.size).toBe(1);
    expect(tally.get('ans-blue')?.size).toBe(0);
  });

  it('deduplicates votes from the same sender — latest timestamp wins', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const children = [
      makeResponseEvent('@alice:test', ['ans-red'], 2_000), // older
      makeResponseEvent('@alice:test', ['ans-blue'], 3_000), // newer — should win
    ];
    const room = makeRoom(children);

    const { tally } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(tally.get('ans-red')?.size).toBe(0);
    expect(tally.get('ans-blue')?.size).toBe(1);
  });

  it('ignores votes for answer ids not in the poll', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const children = [makeResponseEvent('@alice:test', ['ans-invalid'], 2_000)];
    const room = makeRoom(children);

    const { tally } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(tally.get('ans-red')?.size).toBe(0);
    expect(tally.get('ans-blue')?.size).toBe(0);
  });

  it('caps vote selections to maxSelections', () => {
    const multiAnswers = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ];
    const pollStart = makePollStartEvent('$poll:test', { answers: multiAnswers, maxSelections: 2 });
    // Alice tries to vote for all 3 — only first 2 should count
    const children = [makeResponseEvent('@alice:test', ['a', 'b', 'c'], 2_000)];
    const room = makeRoom(children);

    const { tally } = computeTally(room, '$poll:test', pollStart, multiAnswers, 2, MY_USER_ID);

    expect(tally.get('a')?.size).toBe(1);
    expect(tally.get('b')?.size).toBe(1);
    expect(tally.get('c')?.size).toBe(0); // third selection dropped
  });

  it('marks poll as ended when poll creator sends an end event', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const children = [
      makeResponseEvent('@alice:test', ['ans-red'], 2_000),
      makeEndEvent(POLL_CREATOR, 5_000),
    ];
    const room = makeRoom(children);

    const { isEnded } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(isEnded).toBe(true);
  });

  it('excludes votes submitted after the poll end timestamp', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const end = makeEndEvent(POLL_CREATOR, 3_000);
    const children = [
      makeResponseEvent('@alice:test', ['ans-red'], 2_000), // before end — counts
      makeResponseEvent('@bob:test', ['ans-blue'], 4_000), // after end — excluded
      end,
    ];
    const room = makeRoom(children);

    const { tally } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(tally.get('ans-red')?.size).toBe(1);
    expect(tally.get('ans-blue')?.size).toBe(0);
  });

  it('ignores end events from unauthorised senders', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const children = [
      makeResponseEvent('@alice:test', ['ans-red'], 2_000),
      makeEndEvent('@rogue:test', 3_000), // not creator, no redaction power
    ];
    const room = makeRoom(children, /* maySendRedaction= */ false);

    const { isEnded } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(isEnded).toBe(false);
  });

  it('accepts end events from users with redaction power', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const children = [makeEndEvent('@moderator:test', 3_000)];
    const room = makeRoom(children, /* maySendRedaction= */ true);

    const { isEnded } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(isEnded).toBe(true);
  });

  it('ignores decryption-failure response events', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const children = [
      makeResponseEvent('@alice:test', ['ans-red'], 2_000, /* decryptFailure= */ true),
    ];
    const room = makeRoom(children);

    const { tally } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(tally.get('ans-red')?.size).toBe(0);
  });

  it('reports myVote from the current user', () => {
    const pollStart = makePollStartEvent('$poll:test');
    const children = [makeResponseEvent(MY_USER_ID, ['ans-blue'], 2_000)];
    const room = makeRoom(children);

    const { myVote } = computeTally(room, '$poll:test', pollStart, ANSWERS, 1, MY_USER_ID);

    expect(myVote).toEqual(['ans-blue']);
  });
});

// ---------------------------------------------------------------------------
// formatExpiry
// ---------------------------------------------------------------------------

describe('formatExpiry', () => {
  let now: number;

  beforeEach(() => {
    now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "now" for a past or zero timestamp', () => {
    expect(formatExpiry(now - 1)).toBe('now');
    expect(formatExpiry(now)).toBe('now');
  });

  it('returns "in X min" for times less than 1 hour away', () => {
    expect(formatExpiry(now + 30 * 60_000)).toBe('in 30 min');
  });

  it('returns "in X hr" for times between 1 and 24 hours away', () => {
    expect(formatExpiry(now + 3 * 3_600_000)).toBe('in 3 hr');
  });

  it('returns "in X day(s)" for times between 1 and 6 days away', () => {
    expect(formatExpiry(now + 2 * 86_400_000)).toBe('in 2 days');
    expect(formatExpiry(now + 86_400_000)).toBe('in 1 day');
  });

  it('returns a locale date string for 7+ days away', () => {
    const future = now + 10 * 86_400_000;
    const expected = new Date(future).toLocaleDateString();
    expect(formatExpiry(future)).toBe(expected);
  });
});
