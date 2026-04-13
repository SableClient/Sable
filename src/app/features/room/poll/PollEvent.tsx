import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Checkbox,
  config,
  Icon,
  Icons,
  Line,
  Menu,
  PopOut,
  ProgressBar,
  RadioButton,
  Scroll,
  Text,
  toRem,
} from 'folds';
import {
  M_POLL_END,
  M_POLL_KIND_DISCLOSED,
  M_POLL_RESPONSE,
  M_POLL_START,
  MatrixEvent,
  MatrixEventEvent,
  Room,
  RoomEvent,
} from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { stopPropagation } from '$utils/keyboard';
import {
  Attachment,
  AttachmentBox,
  AttachmentContent,
  AttachmentHeader,
} from '$components/message/attachment/Attachment';
import { MessageEvent } from '$types/matrix/room';
import * as css from './PollEvent.css';

type PollAnswer = { id: string; text: string };

export function extractPollData(mEvent: MatrixEvent): {
  question: string;
  answers: PollAnswer[];
  maxSelections: number;
  isDisclosed: boolean;
  showVoterNames: boolean;
  closesAt: number | undefined;
} | null {
  const content = mEvent.getContent();
  const pollStartKey = M_POLL_START.altName ?? 'org.matrix.msc3381.poll.start';
  const pollData = content[M_POLL_START.name] ?? content[pollStartKey];
  if (!pollData) return null;

  const questionText =
    (pollData.question?.['m.text'] as { body: string }[] | undefined)?.[0]?.body ??
    (pollData.question?.['org.matrix.msc1767.text'] as string | undefined) ??
    '';
  const rawAnswers: {
    id?: string;
    'm.id'?: string;
    'org.matrix.msc1767.text'?: string;
    'm.text'?: { body: string }[];
  }[] = pollData.answers ?? [];
  const answers: PollAnswer[] = rawAnswers.slice(0, 20).map((a) => ({
    id: String(a['m.id'] ?? a.id ?? ''),
    text:
      (a['m.text'] as { body: string }[] | undefined)?.[0]?.body ??
      a['org.matrix.msc1767.text'] ??
      '',
  }));
  const maxSelections =
    typeof pollData.max_selections === 'number' && pollData.max_selections >= 1
      ? pollData.max_selections
      : 1;
  const kind = pollData.kind ?? '';
  const isDisclosed =
    kind === M_POLL_KIND_DISCLOSED.name ||
    kind === (M_POLL_KIND_DISCLOSED.altName ?? 'org.matrix.msc3381.poll.disclosed');
  const showVoterNames = pollData.show_voter_names !== false;
  const rawClosesAt = pollData.closes_at;
  const closesAt = typeof rawClosesAt === 'number' && rawClosesAt > 0 ? rawClosesAt : undefined;
  return { question: questionText, answers, maxSelections, isDisclosed, showVoterNames, closesAt };
}

export function extractVoteSelections(responseEvent: MatrixEvent): string[] {
  const content = responseEvent.getContent();
  const unstablePayload = content['org.matrix.msc3381.poll.response'];
  const selections: unknown =
    content['m.selections'] ??
    (typeof unstablePayload === 'object' && unstablePayload !== null
      ? (unstablePayload as { answers?: unknown }).answers
      : undefined);
  if (!Array.isArray(selections)) return [];
  return selections.filter((s): s is string => typeof s === 'string');
}

type TallyResult = {
  tally: Map<string, Set<string>>;
  myVote: string[];
  isEnded: boolean;
};

export function computeTally(
  room: Room,
  pollEventId: string,
  pollStartEvent: MatrixEvent,
  answers: PollAnswer[],
  maxSelections: number,
  myUserId: string
): TallyResult {
  const childEvents = room
    .getUnfilteredTimelineSet()
    .relations.getAllChildEventsForEvent(pollEventId);

  const userVotes = new Map<string, { ts: number; selections: string[] }>();
  const validAnswerIds = new Set(answers.map((a) => a.id));
  const pollCreator = pollStartEvent.getSender();
  let isEnded = false;
  let endTs: number | undefined;

  childEvents.forEach((event) => {
    if (M_POLL_END.matches(event.getType())) {
      const sender = event.getSender();
      if (!sender) return;
      const ts = event.getTs();
      if (
        sender !== pollCreator &&
        !room.currentState.maySendRedactionForEvent(pollStartEvent, sender)
      )
        return;
      if (endTs !== undefined && endTs <= ts) return;
      endTs = ts;
      isEnded = true;
    }
    if (M_POLL_RESPONSE.matches(event.getType())) {
      if (event.isDecryptionFailure()) return;
      const sender = event.getSender();
      if (!sender) return;
      const ts = event.getTs();
      const existing = userVotes.get(sender);
      if (existing && existing.ts >= ts) return;
      userVotes.set(sender, { ts, selections: extractVoteSelections(event) });
    }
  });

  const cutoff = endTs ?? Number.MAX_SAFE_INTEGER;
  const tally = new Map<string, Set<string>>(answers.map((a) => [a.id, new Set()]));
  userVotes.forEach(({ ts, selections }, userId) => {
    if (ts > cutoff) return;
    const valid = selections.slice(0, maxSelections);
    if (!valid.every((s) => validAnswerIds.has(s))) return;
    valid.forEach((sel) => tally.get(sel)?.add(userId));
  });

  const myEntry = userVotes.get(myUserId);
  let myVote: string[] = [];
  if (myEntry && myEntry.ts <= cutoff) {
    const myValid = myEntry.selections.slice(0, maxSelections);
    if (myValid.every((s) => validAnswerIds.has(s))) myVote = myValid;
  }

  return { tally, myVote, isEnded };
}

export function formatExpiry(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const hours = diff / 3_600_000;
  if (hours < 1) return `in ${Math.round(diff / 60_000)} min`;
  if (hours < 24) return `in ${Math.round(hours)} hr`;
  const days = hours / 24;
  if (days < 7) return `in ${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;
  return new Date(ts).toLocaleDateString();
}

type PollEventProps = {
  room: Room;
  mEvent: MatrixEvent;
  canEnd: boolean;
  outlined?: boolean;
};

export function PollEvent({ room, mEvent, canEnd, outlined }: PollEventProps) {
  const mx = useMatrixClient();
  const myUserId = mx.getUserId() ?? '';
  const pollEventId = mEvent.getId() ?? '';
  const [tick, incrementTick] = useReducer((n: number) => n + 1, 0);
  const [, forceExpiry] = useReducer((n: number) => n + 1, 0);

  const pollData = useMemo(() => extractPollData(mEvent), [mEvent]);

  // Re-compute tally whenever a new response/end event lands
  useEffect(() => {
    const onTimeline = (event: MatrixEvent) => {
      const relTo = event.getContent()?.['m.relates_to']?.event_id;
      if (relTo === pollEventId) incrementTick();
    };
    room.on(RoomEvent.Timeline, onTimeline);
    return () => {
      room.off(RoomEvent.Timeline, onTimeline);
    };
  }, [room, pollEventId]);

  // Also re-compute when an encrypted poll response/end is decrypted
  useEffect(() => {
    const onDecrypted = (event: MatrixEvent) => {
      if (M_POLL_RESPONSE.matches(event.getType()) || M_POLL_END.matches(event.getType())) {
        const relTo = event.getContent()?.['m.relates_to']?.event_id;
        if (relTo === pollEventId) incrementTick();
      }
    };
    mx.on(MatrixEventEvent.Decrypted, onDecrypted);
    return () => {
      mx.off(MatrixEventEvent.Decrypted, onDecrypted);
    };
  }, [mx, pollEventId]);

  // Re-render when the expiry countdown reaches zero
  useEffect(() => {
    if (!pollData?.closesAt) return undefined;
    const remaining = pollData.closesAt - Date.now();
    if (remaining <= 0) return undefined;
    const timer = setTimeout(forceExpiry, remaining);
    return () => clearTimeout(timer);
  }, [pollData?.closesAt]);

  const { tally, myVote, isEnded } = useMemo(
    () =>
      pollData
        ? computeTally(
            room,
            pollEventId,
            mEvent,
            pollData.answers,
            pollData.maxSelections,
            myUserId
          )
        : { tally: new Map<string, Set<string>>(), myVote: [] as string[], isEnded: false },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, pollEventId, mEvent, pollData, myUserId, tick]
  );

  const isExpiredByTime = pollData?.closesAt !== undefined && Date.now() >= pollData.closesAt;
  const effectivelyEnded = isEnded || isExpiredByTime;
  const showResults = effectivelyEnded || (pollData?.isDisclosed ?? false);

  const totalVoters = useMemo(
    () => new Set([...tally.values()].flatMap((s) => [...s])).size,
    [tally]
  );

  const handleAnswerClick = useCallback(
    (answerId: string) => {
      if (effectivelyEnded || !pollData) return;
      const { maxSelections } = pollData;
      let next: string[];
      if (maxSelections === 1) {
        next = myVote[0] === answerId ? [] : [answerId];
      } else if (myVote.includes(answerId)) {
        next = myVote.filter((id) => id !== answerId);
      } else {
        next = [...myVote, answerId].slice(0, maxSelections);
      }
      const selections: Record<string, string[]> = { 'm.selections': next };
      mx.sendEvent(room.roomId, MessageEvent.PollResponse as any, {
        'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId },
        ...selections,
        'org.matrix.msc3381.poll.response': { answers: next },
      }).catch(() => undefined);
    },
    [effectivelyEnded, pollData, myVote, mx, room.roomId, pollEventId]
  );

  const endPoll = useCallback(() => {
    mx.sendEvent(room.roomId, MessageEvent.PollEnd as any, {
      'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId },
      'org.matrix.msc3381.poll.end': {},
      body: 'The poll has ended',
    }).catch(() => undefined);
  }, [mx, room.roomId, pollEventId]);

  const [expandedVoters, setExpandedVoters] = useState<{ id: string; anchor: DOMRect } | null>(
    null
  );
  const toggleVoters = useCallback(
    (id: string, anchor: DOMRect) =>
      setExpandedVoters((prev) => (prev?.id === id ? null : { id, anchor })),
    []
  );
  const canShowVoters = (pollData?.showVoterNames ?? false) && showResults;

  if (!pollData) return null;

  const { question, answers, isDisclosed, closesAt, maxSelections } = pollData;
  const isMultiSelect = maxSelections > 1;
  const voterLabel = `${totalVoters} ${totalVoters === 1 ? 'voter' : 'voters'}`;

  let statusText: string;
  if (isEnded) statusText = `Poll ended · ${voterLabel}`;
  else if (isExpiredByTime) statusText = `Poll expired · ${voterLabel}`;
  else if (closesAt !== undefined && !isDisclosed)
    statusText = `${voterLabel} · Results hidden until closed · Closes ${formatExpiry(closesAt)}`;
  else if (closesAt !== undefined) statusText = `${voterLabel} · Closes ${formatExpiry(closesAt)}`;
  else if (!isDisclosed) statusText = `${voterLabel} · Results hidden until closed`;
  else statusText = voterLabel;

  return (
    <Attachment outlined={outlined}>
      <AttachmentHeader>
        <Box grow="Yes">
          <Text size="T300" priority="300">
            {isDisclosed ? 'Poll' : 'Undisclosed Poll'}
          </Text>
        </Box>
        <Text size="T300" priority="300">
          {voterLabel}
        </Text>
      </AttachmentHeader>
      <AttachmentBox>
        <AttachmentContent>
          <Box direction="Column" gap="300">
            <Text size="H5">{question || '(no question)'}</Text>
            <Line variant="Surface" size="300" />
            <Box direction="Column" gap="200">
              {answers.map((answer) => {
                const voteCount = tally.get(answer.id)?.size ?? 0;
                const percent = totalVoters > 0 ? Math.round((voteCount / totalVoters) * 100) : 0;
                const isSelected = myVote.includes(answer.id);

                let textZone: ReactNode;
                if (canShowVoters && voteCount > 0) {
                  textZone = (
                    <button
                      type="button"
                      className={css.AnswerTextButton}
                      onClick={(e) =>
                        toggleVoters(answer.id, e.currentTarget.getBoundingClientRect())
                      }
                      aria-expanded={expandedVoters?.id === answer.id}
                      aria-label={`${answer.text}, ${percent}%, ${
                        expandedVoters?.id === answer.id ? 'hide' : 'show'
                      } voters`}
                    >
                      <Text size="T300" style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        {answer.text}
                      </Text>
                      <Text size="T200" priority="300" style={{ flexShrink: 0 }}>
                        {expandedVoters?.id === answer.id ? '\u25BE' : '\u25B8'} {percent}%
                      </Text>
                    </button>
                  );
                } else if (!effectivelyEnded) {
                  textZone = (
                    <button
                      type="button"
                      className={css.AnswerTextButton}
                      onClick={() => handleAnswerClick(answer.id)}
                      aria-pressed={isSelected}
                      aria-label={answer.text}
                    >
                      <Text size="T300" style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        {answer.text}
                      </Text>
                      {showResults && (
                        <Text size="T200" priority="300" style={{ flexShrink: 0 }}>
                          {percent}%
                        </Text>
                      )}
                    </button>
                  );
                } else {
                  textZone = (
                    <span className={css.AnswerTextRow}>
                      <Text size="T300" style={{ flex: 1, minWidth: 0 }}>
                        {answer.text}
                      </Text>
                      {showResults && (
                        <Text size="T200" priority="300" style={{ flexShrink: 0 }}>
                          {percent}%
                        </Text>
                      )}
                    </span>
                  );
                }

                return (
                  <Box
                    key={answer.id}
                    direction="Column"
                    gap="100"
                    style={{ opacity: effectivelyEnded && !isSelected ? 0.7 : 1 }}
                  >
                    <Box direction="Row" alignItems="Center" gap="200">
                      <button
                        type="button"
                        className={css.RadioZone}
                        onClick={() => handleAnswerClick(answer.id)}
                        disabled={effectivelyEnded}
                        aria-pressed={isSelected}
                        aria-label={`Vote for ${answer.text}`}
                      >
                        {isMultiSelect ? (
                          <Checkbox size="50" checked={isSelected} readOnly tabIndex={-1} />
                        ) : (
                          <RadioButton size="50" checked={isSelected} readOnly tabIndex={-1} />
                        )}
                      </button>
                      {textZone}
                    </Box>
                    {showResults && (
                      <ProgressBar
                        value={voteCount}
                        max={Math.max(totalVoters, 1)}
                        variant={isSelected ? 'Primary' : 'Secondary'}
                        fill="Soft"
                        size="300"
                        radii="Pill"
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
            <Line variant="Surface" size="300" />
            <Box
              direction="Row"
              alignItems="Center"
              justifyContent="SpaceBetween"
              gap="200"
              style={{ flexWrap: 'wrap' }}
            >
              <Text size="T200" priority="300">
                {statusText}
              </Text>
              {!effectivelyEnded && canEnd && (
                <Button
                  type="button"
                  variant="Critical"
                  size="300"
                  radii="300"
                  before={<Icon size="100" src={Icons.Cross} />}
                  onClick={endPoll}
                >
                  <Text size="B300">End Poll</Text>
                </Button>
              )}
            </Box>
          </Box>
        </AttachmentContent>
      </AttachmentBox>
      {expandedVoters && canShowVoters && (
        <PopOut
          anchor={expandedVoters.anchor}
          position="Top"
          align="Start"
          offset={4}
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                returnFocusOnDeactivate: false,
                onDeactivate: () => setExpandedVoters(null),
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <Menu style={{ maxWidth: toRem(240), minWidth: toRem(120) }}>
                <Box
                  direction="Column"
                  gap="100"
                  style={{ padding: config.space.S100 }}
                  tabIndex={0}
                >
                  <Text size="L400" priority="300" style={{ padding: `0 ${config.space.S100}` }}>
                    Voters
                  </Text>
                  <Scroll style={{ maxHeight: toRem(200) }} hideTrack visibility="Hover">
                    <Box direction="Column">
                      {[...(tally.get(expandedVoters.id) ?? [])].map((userId) => (
                        <Box
                          key={userId}
                          style={{ padding: `${config.space.S100} ${config.space.S100}` }}
                        >
                          <Text size="T300" truncate>
                            {room.getMember(userId)?.name ?? userId}
                          </Text>
                        </Box>
                      ))}
                    </Box>
                  </Scroll>
                </Box>
              </Menu>
            </FocusTrap>
          }
        />
      )}
    </Attachment>
  );
}
