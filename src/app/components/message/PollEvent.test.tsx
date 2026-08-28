import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  M_POLL_END,
  M_POLL_KIND_DISCLOSED,
  M_POLL_RESPONSE,
  M_POLL_START,
  M_TEXT,
  type MatrixEvent,
} from 'matrix-js-sdk';
import { PollEvent, getCountedSelections, getPollResponseAnswers } from './PollEvent';

const POLL_ID = '$poll';
const VIEWER = '@bob:e.dev';

const pollContent = {
  [M_POLL_START.name]: {
    question: { [M_TEXT.name]: 'Lunch?', body: 'Lunch?' },
    kind: M_POLL_KIND_DISCLOSED.name,
    max_selections: 1,
    answers: [
      { id: 'a', [M_TEXT.name]: 'Pizza' },
      { id: 'b', [M_TEXT.name]: 'Sushi' },
    ],
  },
};

const childEvent = (sender: string, content: Record<string, unknown>) =>
  ({
    event: { sender, origin_server_ts: 1 },
    getContent: () => content,
    getSender: () => sender,
    getRelation: () => ({ rel_type: 'm.reference', event_id: POLL_ID }),
    getId: () => `$${sender}`,
    getAssociatedId: () => POLL_ID,
  }) as unknown as MatrixEvent;

const vote = (sender: string, answers: string[], key: string = M_POLL_RESPONSE.name) =>
  childEvent(sender, { [key]: { answers } });

function makeRoom(children: MatrixEvent[]) {
  const roomState = { maySendRedactionForEvent: () => false };
  const liveTimeline = { getState: () => roomState };
  const timelineSet = { relations: { getAllChildEventsForEvent: () => children } };

  return {
    roomId: '!r:e.dev',
    on: () => {},
    removeListener: () => {},
    getMember: () => null,
    getLiveTimeline: () => liveTimeline,
    getUnfilteredTimelineSet: () => timelineSet,
  };
}

function renderPoll(children: MatrixEvent[], content: Record<string, unknown> = pollContent) {
  const mEvent = {
    getId: () => POLL_ID,
    getSender: () => '@alice:e.dev',
    sender: { userId: '@alice:e.dev' },
  };

  return render(
    <PollEvent
      content={content}
      mEvent={mEvent as unknown as MatrixEvent}
      mx={{ getUserId: () => VIEWER } as never}
      room={makeRoom(children) as never}
    />
  );
}

describe('getPollResponseAnswers', () => {
  it('reads answers from the unstable and stable namespaces', () => {
    expect(getPollResponseAnswers(vote('@a:e.dev', ['a']))).toEqual(['a']);
    expect(getPollResponseAnswers(vote('@a:e.dev', ['b'], M_POLL_RESPONSE.altName))).toEqual(['b']);
  });

  it('returns undefined for events that are not usable votes', () => {
    expect(getPollResponseAnswers(childEvent('@a:e.dev', {}))).toBeUndefined();
    expect(
      getPollResponseAnswers(childEvent('@a:e.dev', { [M_POLL_END.name]: {} }))
    ).toBeUndefined();
    expect(
      getPollResponseAnswers(childEvent('@a:e.dev', { [M_POLL_RESPONSE.name]: {} }))
    ).toBeUndefined();
    expect(
      getPollResponseAnswers(childEvent('@a:e.dev', { [M_POLL_RESPONSE.name]: { answers: 'a' } }))
    ).toBeUndefined();
  });

  it('returns undefined for a vote that has not been decrypted', () => {
    const pending = childEvent('@a:e.dev', {
      algorithm: 'm.megolm.v1.aes-sha2',
      ciphertext: 'AwgAEn...',
      session_id: 'sess',
    });
    expect(getPollResponseAnswers(pending)).toBeUndefined();

    const failed = childEvent('@a:e.dev', {
      msgtype: 'm.bad.encrypted',
      body: '** Unable to decrypt: The sender key was not found **',
    });
    expect(getPollResponseAnswers(failed)).toBeUndefined();
  });

  it('drops non-string answer entries', () => {
    const bad = childEvent('@a:e.dev', { [M_POLL_RESPONSE.name]: { answers: ['a', 3, null] } });
    expect(getPollResponseAnswers(bad)).toEqual(['a']);
  });
});

describe('getCountedSelections', () => {
  const answerIds = new Set(['a', 'b', 'c']);

  it('truncates to max_selections rather than spoiling the vote', () => {
    expect(getCountedSelections(vote('@a:e.dev', ['a', 'b', 'c']), answerIds, 2)).toEqual([
      'a',
      'b',
    ]);
  });

  it('spoils the vote when any answer id is unknown', () => {
    expect(getCountedSelections(vote('@a:e.dev', ['a', 'nope']), answerIds, 2)).toEqual([]);
  });

  it('counts a repeated id once', () => {
    expect(getCountedSelections(vote('@a:e.dev', ['a', 'a']), answerIds, 2)).toEqual(['a']);
  });

  it('treats an empty selection as an unvote', () => {
    expect(getCountedSelections(vote('@a:e.dev', []), answerIds, 1)).toEqual([]);
  });

  it('spoils a vote it cannot read at all', () => {
    expect(getCountedSelections(childEvent('@a:e.dev', {}), answerIds, 1)).toEqual([]);
  });
});

describe('PollEvent', () => {
  it('renders a poll whose child events include one with no content', () => {
    expect(() => renderPoll([vote(VIEWER, ['a']), childEvent('@empty:e.dev', {})])).not.toThrow();

    expect(screen.getByText('(1 vote)')).toBeTruthy();
    expect(screen.getByText(/^1 vote$/)).toBeTruthy();
  });

  it('counts a vote sent under the stable namespace', () => {
    renderPoll([vote(VIEWER, ['a'], M_POLL_RESPONSE.altName)]);

    expect(screen.getByText('(1 vote)')).toBeTruthy();
    expect(screen.getByText('(0 votes)')).toBeTruthy();
  });

  it('treats a stable-namespace poll end as an end, not a vote', () => {
    renderPoll([childEvent('@alice:e.dev', { [M_POLL_END.altName]: {} })]);

    expect(screen.getByText('This poll has ended.')).toBeTruthy();
  });

  it('renders a poll whose child events include an undecrypted vote', () => {
    expect(() =>
      renderPoll([
        vote(VIEWER, ['a']),
        childEvent('@nokeys:e.dev', {
          msgtype: 'm.bad.encrypted',
          body: '** Unable to decrypt: The sender key was not found **',
        }),
      ])
    ).not.toThrow();

    expect(screen.getByText(/^1 vote$/)).toBeTruthy();
  });

  it('defaults max_selections to 1 when the poll start omits it', () => {
    const { question, answers, kind } = pollContent[M_POLL_START.name];
    renderPoll([vote(VIEWER, ['a', 'b'])], {
      [M_POLL_START.name]: { question, answers, kind },
    });

    expect(screen.getByText('(1 vote)')).toBeTruthy();
    expect(screen.getByText('(0 votes)')).toBeTruthy();
  });

  it('renders a poll start that carries no answers', () => {
    expect(() =>
      renderPoll([], { [M_POLL_START.name]: { question: { body: 'Broken' } } })
    ).not.toThrow();
  });
});
