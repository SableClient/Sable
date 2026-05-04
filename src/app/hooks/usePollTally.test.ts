import { describe, it, expect } from 'vitest';
import type { Relations } from '$types/matrix-sdk';
import type { MatrixEvent } from '$types/matrix-sdk';
import { M_POLL_RESPONSE } from 'matrix-js-sdk/lib/@types/polls';
import type { PollAnswer } from 'matrix-js-sdk/lib/@types/polls';
import { tallyCounts } from '$hooks/usePollTally';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRelations(events: Partial<MatrixEvent>[]): Relations {
  return {
    getRelations: () => events as MatrixEvent[],
  } as unknown as Relations;
}

function makeVote(sender: string, answerIds: string[], ts = 1000): Partial<MatrixEvent> {
  return {
    getSender: () => sender,
    getTs: () => ts,
    getContent: (() => ({
      [M_POLL_RESPONSE.name]: { answers: answerIds },
    })) as MatrixEvent['getContent'],
  };
}

const ANSWERS: PollAnswer[] = [
  { id: 'a', body: 'Option A', mimetype: 'text/plain' } as unknown as PollAnswer,
  { id: 'b', body: 'Option B', mimetype: 'text/plain' } as unknown as PollAnswer,
  { id: 'c', body: 'Option C', mimetype: 'text/plain' } as unknown as PollAnswer,
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('tallyCounts', () => {
  it('returns zero counts and no voters for empty relations', () => {
    const result = tallyCounts(ANSWERS, makeRelations([]), '@me:example.com', 1);
    expect(result.totalVoters).toBe(0);
    expect(result.counts.get('a')).toBe(0);
    expect(result.myAnswers).toEqual([]);
  });

  it('counts a single vote correctly', () => {
    const rel = makeRelations([makeVote('@alice:example.com', ['a'])]);
    const result = tallyCounts(ANSWERS, rel, '@me:example.com', 1);
    expect(result.counts.get('a')).toBe(1);
    expect(result.counts.get('b')).toBe(0);
    expect(result.totalVoters).toBe(1);
  });

  it('only counts the last vote per user', () => {
    const rel = makeRelations([
      makeVote('@alice:example.com', ['a'], 1000),
      makeVote('@alice:example.com', ['b'], 2000), // later — should win
    ]);
    const result = tallyCounts(ANSWERS, rel, '@me:example.com', 1);
    expect(result.counts.get('a')).toBe(0);
    expect(result.counts.get('b')).toBe(1);
    expect(result.totalVoters).toBe(1);
  });

  it('ignores invalid answer IDs (not in poll answers)', () => {
    const rel = makeRelations([makeVote('@alice:example.com', ['z'])]);
    const result = tallyCounts(ANSWERS, rel, '@me:example.com', 1);
    expect(result.totalVoters).toBe(0);
    expect([...result.counts.values()].every((v) => v === 0)).toBe(true);
  });

  it('tracks the current user vote in myAnswers', () => {
    const rel = makeRelations([makeVote('@me:example.com', ['c'])]);
    const result = tallyCounts(ANSWERS, rel, '@me:example.com', 1);
    expect(result.myAnswers).toEqual(['c']);
  });

  it('supports multi-select up to max_selections', () => {
    const rel = makeRelations([makeVote('@alice:example.com', ['a', 'b', 'c'])]);
    // max_selections = 2 → only first 2 are kept
    const result = tallyCounts(ANSWERS, rel, '@me:example.com', 2);
    expect(result.counts.get('a')).toBe(1);
    expect(result.counts.get('b')).toBe(1);
    expect(result.counts.get('c')).toBe(0);
  });

  it('handles null/undefined relations gracefully', () => {
    const result = tallyCounts(ANSWERS, null, '@me:example.com', 1);
    expect(result.totalVoters).toBe(0);
  });

  it('counts multiple distinct voters independently', () => {
    const rel = makeRelations([
      makeVote('@alice:example.com', ['a']),
      makeVote('@bob:example.com', ['a']),
      makeVote('@carol:example.com', ['b']),
    ]);
    const result = tallyCounts(ANSWERS, rel, '@me:example.com', 1);
    expect(result.counts.get('a')).toBe(2);
    expect(result.counts.get('b')).toBe(1);
    expect(result.totalVoters).toBe(3);
  });

  it('treats empty answers array as a spoil (abstain) — not counted in totalVoters', () => {
    const rel = makeRelations([makeVote('@alice:example.com', [])]);
    const result = tallyCounts(ANSWERS, rel, '@me:example.com', 1);
    expect(result.totalVoters).toBe(0);
  });
});
