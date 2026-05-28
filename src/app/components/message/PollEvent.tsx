import { useMatrixClient } from '$hooks/useMatrixClient';
import { Box, color, config, Header, ProgressBar, RadioButton, Text, toRem } from 'folds';
import type { TimelineEvents } from 'matrix-js-sdk';
import {
  M_POLL_KIND_DISCLOSED,
  M_POLL_RESPONSE,
  M_POLL_START,
  REFERENCE_RELATION,
  type MatrixEvent,
} from 'matrix-js-sdk';

type PollEventProps = {
  content: Record<string, unknown>;
  mEvent?: MatrixEvent;
};

type PollAnswerItem = {
  id: string;
  'org.matrix.msc1767.text': string;
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
export function PollEvent({ content, mEvent }: PollEventProps) {
  const mx = useMatrixClient();
  if (!content || !mEvent) return null;

  const roomId = mEvent.getRoomId();
  const room = mx.getRoom(roomId);
  const eventId = mEvent.getId();

  const poll = content[M_POLL_START.name];
  const question = (poll as { question?: string })?.question;
  const questionBody = (question as { body?: string })?.body ?? '';
  const answers = (poll as { answers: PollAnswerItem[] })?.answers;
  const maxSelections = (poll as { max_selections: number })?.max_selections;
  const isDisclosed = (poll as { kind: string })?.kind === M_POLL_KIND_DISCLOSED.name;

  let votes: PollVotes = {};
  answers.forEach((item) => (votes[item.id] = 0));

  const childEvents = room
    ?.getUnfilteredTimelineSet()
    .relations.getAllChildEventsForEvent(eventId ?? '')
    .filter((event) => event.getRelation()?.rel_type === REFERENCE_RELATION.name);
  const sortedChildEvents = childEvents?.toSorted((a: MatrixEvent, b: MatrixEvent) =>
    a.event.origin_server_ts && b.event.origin_server_ts
      ? b.event.origin_server_ts - a.event.origin_server_ts
      : 0
  );
  let filteredChildEvents: MatrixEvent[] = [];
  sortedChildEvents?.forEach((item) => {
    if (!filteredChildEvents.find((fCE) => fCE.event.sender === item.event.sender))
      filteredChildEvents.push(item);
  });

  filteredChildEvents?.map((item) => {
    const VoteContent = item.getContent();
    const response = VoteContent[M_POLL_RESPONSE.name];
    const selections = response.answers;
    if (selections.length > maxSelections) return;

    selections.forEach((selection: string) => {
      if (votes[selection] !== undefined) votes[selection] += 1;
    });
  });
  const totalVotes = Object.values(votes).reduce((a, b) => a + b);

  const userSelectionEvent = filteredChildEvents.find(
    (item) => item.sender?.userId == mx.getUserId()
  );
  const userSelectionContent = userSelectionEvent?.getContent();
  const userSelection: string[] = userSelectionContent
    ? userSelectionContent[M_POLL_RESPONSE.name]?.answers
    : undefined;
  function handleClick(id: string) {
    if (!eventId || !roomId || maxSelections === 0) return;
    let newAnswers: string[] = [];
    if (userSelection.includes(id)) newAnswers = userSelection.filter((item) => item !== id);
    else newAnswers = [...userSelection, id];

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

  return (
    <Box
      direction="Column"
      style={{
        backgroundColor: color.SurfaceVariant.Container,
        maxWidth: toRem(500),
        borderRadius: config.radii.R500,
      }}
      gap="0"
    >
      <Header variant="Primary" style={{ padding: config.space.S400 }}>
        <Box gap="200" grow="Yes" justifyContent="SpaceBetween">
          <Text>{questionBody} </Text>
          <Text size="T200">{` (${totalVotes} vote${totalVotes > 1 ? 's' : ''})`}</Text>
        </Box>
      </Header>
      <Box direction="Column" grow="Yes" style={{ padding: config.space.S200 }} gap="300">
        {answers.map((item) => {
          const optionBody = item['org.matrix.msc1767.text'];
          const voteCount = votes[item.id];
          const isSelected = userSelection.includes(item.id);
          return (
            <Box key={item.id} gap="100" direction="Column">
              <Box gap="100" alignItems="Center">
                <RadioButton
                  size="100"
                  checked={isSelected}
                  variant={isSelected ? 'Primary' : 'Secondary'}
                  onClick={() => handleClick(item.id)}
                />
                <Box justifyContent="SpaceBetween" grow="Yes" alignItems="Center">
                  <Text>{optionBody}</Text>

                  {isDisclosed && (
                    <Text size="T200" style={{ color: color.SurfaceVariant.OnContainer }}>
                      {`(${voteCount} vote${voteCount !== 1 ? 's' : ''})`}
                    </Text>
                  )}
                </Box>
              </Box>
              {isDisclosed && (
                <ProgressBar
                  size="400"
                  value={voteCount ? voteCount / totalVotes : 0}
                  max={1}
                  variant={isSelected ? 'Primary' : 'Secondary'}
                  title={voteCount ? `${Math.round((voteCount / totalVotes) * 100)}%` : '0%'}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
