import {
  Box,
  Button,
  Checkbox,
  Line,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  ProgressBar,
  RadioButton,
  Text,
} from 'folds';
import type { MatrixClient, PollStartSubtype, Room, TimelineEvents } from 'matrix-js-sdk';
import { M_TEXT } from 'matrix-js-sdk';
import {
  EventTimeline,
  M_POLL_END,
  M_POLL_KIND_DISCLOSED,
  M_POLL_RESPONSE,
  M_POLL_START,
  REFERENCE_RELATION,
  type MatrixEvent,
} from 'matrix-js-sdk';
import * as css from './PollEvent.css';
import { useCallback, useEffect, useState } from 'react';
import { PollResponsesViewer } from '$features/room/poll-modals';
import { stopPropagation } from '$utils/keyboard';
import FocusTrap from 'focus-trap-react';

type PollEventProps = {
  content: Record<string, unknown>;
  mEvent: MatrixEvent;
  mx: MatrixClient;
  room: Room;
};

export type PollAnswerItem = {
  id: string;
  [M_TEXT.name]: string;
};

type PollVotes = {
  [vote: string]: number;
};

type PollResponse = {
  'm.relates_to': {
    rel_type: string;
    event_id: string;
  };
  [M_POLL_RESPONSE.name]: {
    answers: string[];
  };
};
export function PollEvent({ content, mEvent, mx, room }: PollEventProps) {
  const eventId = mEvent.getId();
  const userId = mx.getUserId() ?? '';
  const roomId = room.roomId;
  const roomState = room.getLiveTimeline()?.getState(EventTimeline.FORWARDS);
  const pollSender = mEvent.getSender();

  const poll = content[M_POLL_START.name] as PollStartSubtype;
  const questionBody = (poll?.question as { body?: string })?.body ?? '';
  const answers = (poll as { answers: PollAnswerItem[] })?.answers;
  const maxSelections = (poll as { max_selections: number })?.max_selections;
  const isDisclosed = (poll as { kind: string })?.kind === M_POLL_KIND_DISCLOSED.name;
  const canEnd =
    userId === mEvent.sender?.userId || roomState?.maySendRedactionForEvent(mEvent, userId);

  let votes: PollVotes = {};
  answers.forEach((item) => (votes[item.id] = 0));

  const [ViewVotersAnswer, setViewVotersAnswer] = useState<PollAnswerItem | undefined>(undefined);
  const [isSnooping, setIsSnooping] = useState<boolean>(false);

  // This should technically request the permissions at the time of the end of the event but that doesnt seem to be supported by the sdk
  const getEndIndex = useCallback(
    (events: MatrixEvent[]) =>
      events.findLastIndex((item) => {
        const itemSender = item.getSender();
        return (
          M_POLL_END.name in item.getContent() &&
          typeof item.getSender() === 'string' &&
          pollSender &&
          itemSender &&
          (itemSender === pollSender || roomState?.maySendRedactionForEvent(mEvent, itemSender))
        );
      }),
    [roomState, mEvent, pollSender]
  );

  const sortChildEvents = useCallback((events: MatrixEvent[]) => {
    if (!events) return [];

    const sortedArray = events.toSorted((a: MatrixEvent, b: MatrixEvent) =>
      a.event.origin_server_ts && b.event.origin_server_ts
        ? b.event.origin_server_ts - a.event.origin_server_ts
        : 0
    );

    return sortedArray;
  }, []);

  const childEvents = room
    ?.getUnfilteredTimelineSet()
    .relations.getAllChildEventsForEvent(eventId ?? '')
    .filter((event) => event.getRelation()?.rel_type === REFERENCE_RELATION.name);

  // manual sorting because the timeline is sometimes sent stupidly <3
  const [sortedChildEvents, setSortedChildEvents] = useState(sortChildEvents(childEvents));
  const [isEnded, setIsEnded] = useState(getEndIndex(sortedChildEvents) !== -1);

  // ensure a new sorted array is only generated when a new list is made
  useEffect(() => {
    let newChildEvents = childEvents ? sortChildEvents(childEvents) : [];
    const newEndIndex = getEndIndex(newChildEvents);

    setSortedChildEvents(newChildEvents);
    setIsEnded(newEndIndex !== -1);

    // This is to avoid recomputation for anything but the childEvents changing
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps
  }, [childEvents.length, sortChildEvents, getEndIndex]);

  if (!content) return null;
  const finalArray = isEnded
    ? sortedChildEvents.slice(getEndIndex(sortedChildEvents) + 1)
    : sortedChildEvents;
  //filter for a unique event from each sender
  let voters = new Set<string>();
  let filteredChildEvents: MatrixEvent[] = [];
  if (isDisclosed || isEnded)
    finalArray?.forEach((item) => {
      if (M_POLL_END.name in item.getContent()) {
        return;
      }
      if (item.event.sender && !voters.has(item.event.sender)) {
        voters.add(item.event.sender);
        filteredChildEvents.push(item);
      }
    });

  filteredChildEvents?.forEach((item) => {
    const VoteContent = item.getContent();
    const response = VoteContent[M_POLL_RESPONSE.name];
    const selections = response?.answers;
    if (selections.length > maxSelections || selections.length === 0) {
      if (item.event.sender) voters.delete(item.event.sender);
      return;
    }

    selections.forEach((selection: string) => {
      if (votes[selection] !== undefined) votes[selection] += 1;
    });
  });
  const totalVotes = Object.values(votes).reduce((a, b) => a + b);

  const userSelectionEvent =
    filteredChildEvents.length > 0
      ? filteredChildEvents.find((item) => item.event.sender === userId)
      : finalArray.find((item) => item.event.sender === userId);
  const userSelectionContent = userSelectionEvent?.getContent();
  const userSelection: string[] = userSelectionContent
    ? userSelectionContent[M_POLL_RESPONSE.name]?.answers
    : undefined;
  const hasVoted = userSelection?.length > 0;
  const showAnswers = (isDisclosed && (hasVoted || isSnooping)) || isEnded;

  function handleNewVote(id: string) {
    if (!eventId || !roomId || maxSelections < 1) return;
    let newAnswers: string[] = [];
    if (userSelection?.includes(id)) newAnswers = userSelection.filter((item) => item !== id);
    else newAnswers = userSelection ? [...userSelection, id] : [id];

    if (newAnswers.length > maxSelections) {
      newAnswers = newAnswers.slice(newAnswers.length - maxSelections);
    }

    let newContent: PollResponse = {
      'm.relates_to': {
        rel_type: 'm.reference',
        event_id: eventId,
      },
      [M_POLL_RESPONSE.name]: {
        answers: newAnswers,
      },
    };
    mx.sendEvent(
      roomId,
      M_POLL_RESPONSE.name as keyof TimelineEvents,
      newContent as TimelineEvents[keyof TimelineEvents]
    );
  }
  function handleEndVote() {
    const maxValue = Math.max(...Object.values(votes));
    let endText = 'The Poll has ended and';
    const winnerArray = answers.filter((item) => votes[item.id] === maxValue);
    if (maxValue === 0) endText += ' nobody voted';
    else if (winnerArray.length === 1 && winnerArray[0] && winnerArray[0][M_TEXT.name])
      endText += `${winnerArray[0][M_TEXT.name]} won`;
    else {
      endText += ': ';
      winnerArray.forEach((item, index) => {
        endText += item[M_TEXT.name];
        if (index < winnerArray.length - 2) endText += ', ';
        else if (index < winnerArray.length - 1) endText += ', and ';
      });
      endText += ' won';
    }

    const endContent = {
      'm.relates_to': {
        rel_type: 'm.reference',
        event_id: eventId,
      },
      'org.matrix.msc3381.poll.end': {},
      [M_TEXT.name]: endText,
      body: endText,
      msgtype: 'm.text',
    };
    mx.sendEvent(
      roomId,
      M_POLL_END.name as keyof TimelineEvents,
      endContent as TimelineEvents[keyof TimelineEvents]
    );
  }
  // The choice of making it not the same size and style as an Attachment is deliberate as Polls tipically are Way more wordy and this feels more spacious
  return (
    <>
      <Box direction="Column" className={css.PollEvent} grow="Yes" gap="200">
        <Box className={css.PollHeader} shrink="No">
          <Text>{questionBody} </Text>
        </Box>
        <Line direction="Horizontal" variant="SurfaceVariant" className={css.PollEventSeparator} />
        <Box direction="Column" grow="Yes" shrink="No" gap="300" className={css.PollAnswersBody}>
          {answers.map((item) => {
            const optionBody = item[M_TEXT.name];
            const voteCount = votes[item.id];
            const isSelected = userSelection?.includes(item.id);
            return (
              <Box key={item.id} gap="100" direction="Column" className={css.PollAnswerItem}>
                <Box gap="100" alignItems="Center">
                  {maxSelections === 1 ? (
                    <RadioButton
                      size="100"
                      aria-disabled={isEnded}
                      disabled={isEnded}
                      checked={isSelected}
                      aria-label={`${isSelected ? 'Remove vote from' : 'vote for'} ${optionBody}`}
                      variant={isSelected ? 'Primary' : 'Secondary'}
                      onClick={() => handleNewVote(item.id)}
                    />
                  ) : (
                    <Checkbox
                      size="100"
                      aria-disabled={isEnded}
                      disabled={isEnded}
                      checked={isSelected}
                      aria-label={`${isSelected ? 'Remove vote from' : 'vote for'} ${optionBody}`}
                      variant={isSelected ? 'Primary' : 'Secondary'}
                      onClick={() => handleNewVote(item.id)}
                    />
                  )}
                  <Box justifyContent="SpaceBetween" grow="Yes" alignItems="Center">
                    <Text>{optionBody}</Text>

                    {showAnswers && (
                      <Text
                        size="T200"
                        className={css.PollAnswerCount}
                        onClick={() => setViewVotersAnswer(item)}
                      >
                        {`(${voteCount} vote${voteCount !== 1 ? 's' : ''})`}
                      </Text>
                    )}
                  </Box>
                </Box>
                {(isDisclosed || isEnded) && (
                  <ProgressBar
                    size="400"
                    value={showAnswers ? (voteCount ?? 0) / voters.size : 0}
                    max={1}
                    variant={isSelected ? 'Primary' : 'Secondary'}
                    title={voteCount ? `${Math.round((voteCount / voters.size) * 100)}%` : '0%'}
                    className={css.PollAnswerBar}
                  />
                )}
              </Box>
            );
          })}
          <Box gap="200" grow="Yes" shrink="No" justifyContent="SpaceBetween" alignItems="Center">
            {showAnswers ? (
              <Text size="T200">
                {`${totalVotes} vote${totalVotes !== 1 ? 's' : ''} ${totalVotes !== voters.size ? `by ${voters.size} voter${voters.size !== 1 ? 's' : ''}` : ''}`}
              </Text>
            ) : isDisclosed ? (
              <Text onClick={() => setIsSnooping(true)} style={{ cursor: 'pointer' }} size="T200">
                Click here to show results
              </Text>
            ) : (
              <Text size="T200">Results will be shown when the poll is over </Text>
            )}
            <Box alignItems="Center" gap="200">
              <Text size="T200">
                {maxSelections !== 1 && maxSelections !== answers.length
                  ? `Max ${maxSelections} options.`
                  : ''}
              </Text>
              {!isEnded && canEnd && (
                <Button
                  size="300"
                  radii="400"
                  variant="Critical"
                  fill="Soft"
                  onClick={handleEndVote}
                >
                  End Poll
                </Button>
              )}
              {isEnded && <Text size="T200">This poll has ended.</Text>}
            </Box>
          </Box>
        </Box>
      </Box>
      {ViewVotersAnswer && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setViewVotersAnswer(undefined),
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <Modal variant="Surface">
                <PollResponsesViewer
                  room={room}
                  answers={answers}
                  events={filteredChildEvents}
                  initialSelection={ViewVotersAnswer}
                  onClose={() => setViewVotersAnswer(undefined)}
                />
              </Modal>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
    </>
  );
}
