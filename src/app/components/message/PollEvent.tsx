import { useMatrixClient } from '$hooks/useMatrixClient';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import {
  Box,
  Button,
  color,
  config,
  Header,
  Line,
  ProgressBar,
  RadioButton,
  Text,
  toRem,
} from 'folds';
import type { Room, TimelineEvents } from 'matrix-js-sdk';
import {
  M_POLL_END,
  M_POLL_KIND_DISCLOSED,
  M_POLL_RESPONSE,
  M_POLL_START,
  REFERENCE_RELATION,
  type MatrixEvent,
} from 'matrix-js-sdk';

type PollEventProps = {
  content: Record<string, unknown>;
  mEvent: MatrixEvent;
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

  const roomId = mEvent.getRoomId() as string;
  const room = mx.getRoom(roomId) as Room;
  const eventId = mEvent.getId();

  // TODO: Delete or move into a better place to not make polls be laggy
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);

  if (!content) return null;

  const poll = content[M_POLL_START.name];
  const question = (poll as { question?: string })?.question;
  const questionBody = (question as { body?: string })?.body ?? '';
  const answers = (poll as { answers: PollAnswerItem[] })?.answers;
  const maxSelections = (poll as { max_selections: number })?.max_selections;
  const isDisclosed = (poll as { kind: string })?.kind === M_POLL_KIND_DISCLOSED.name;
  const canEnd = (mx.getUserId() === mEvent.sender?.userId || permissions.action('redact', mx.getUserId() ?? ''))

  let votes: PollVotes = {};
  answers.forEach((item) => (votes[item.id] = 0));

  const childEvents = room
    ?.getUnfilteredTimelineSet()
    .relations.getAllChildEventsForEvent(eventId ?? '')
    .filter((event) => event.getRelation()?.rel_type === REFERENCE_RELATION.name);
  let sortedChildEvents = childEvents
    ? childEvents.toSorted((a: MatrixEvent, b: MatrixEvent) =>
        a.event.origin_server_ts && b.event.origin_server_ts
          ? b.event.origin_server_ts - a.event.origin_server_ts
          : 0
      )
    : [];

  const endIndex = sortedChildEvents.findLastIndex(
    (item) =>
      item.getContent()[M_POLL_END.name] &&
      (item.sender?.userId === mEvent.sender?.userId ||
        permissions.action('redact', mEvent.sender?.userId ?? ''))
  );
  const isEnded = endIndex !== -1;

  if (isEnded) sortedChildEvents = sortedChildEvents.slice(endIndex + 1);

  //filter for a unique event from each sender
  let voters = new Set<string>();
  let filteredChildEvents: MatrixEvent[] = [];
  sortedChildEvents?.forEach((item) => {
    if (item.event.sender && !voters.has(item.event.sender)) {
      voters.add(item.event.sender);
      filteredChildEvents.push(item);
    }
  });

  filteredChildEvents?.forEach((item) => {
    const VoteContent = item.getContent();
    const response = VoteContent[M_POLL_RESPONSE.name];
    const selections = response?.answers;
    if (!selections || selections?.length > maxSelections) return;

    selections.forEach((selection: string) => {
      if (votes[selection] !== undefined) votes[selection] += 1;
    });
  });
  const totalVotes = Object.values(votes).reduce((a, b) => a + b);

  const userSelectionEvent = filteredChildEvents.find(
    (item) => item.event.sender === mx.getUserId()
  );
  const userSelectionContent = userSelectionEvent?.getContent();
  const userSelection: string[] = userSelectionContent
    ? userSelectionContent[M_POLL_RESPONSE.name]?.answers
    : undefined;
  function handleNewVote(id: string) {
    if (!eventId || !roomId || maxSelections === 0) return;
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
    // TODO Compute the highest values to put in the right place
    const endContent = {
      'm.relates_to': {
        rel_type: 'm.reference',
        event_id: eventId,
      },
      'org.matrix.msc3381.poll.end': {},
      'org.matrix.msc1767.text': 'The Poll has ended',
      body: 'The poll has ended',
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
    <Box
      direction="Column"
      style={{
        backgroundColor: color.SurfaceVariant.Container,
        maxWidth: toRem(500),
        borderRadius: config.radii.R500,
      }}
      grow="Yes"
      gap="0"
    >
      <Header variant="Primary" style={{ padding: config.space.S400 }}>
        <Box gap="200" grow="Yes" justifyContent="SpaceBetween">
          <Text>{questionBody} </Text>
        </Box>
      </Header>
      <Line
        direction="Horizontal"
        variant="SurfaceVariant"
        style={{ width: '99%', alignSelf: 'Center' }}
      />
      <Box direction="Column" grow="Yes" style={{ padding: config.space.S200 }} gap="300">
        {answers.map((item) => {
          const optionBody = item['org.matrix.msc1767.text'];
          const voteCount = votes[item.id];
          const isSelected = userSelection?.includes(item.id);
          return (
            <Box key={item.id} gap="100" direction="Column">
              <Box gap="100" alignItems="Center">
                {!isEnded && (
                  <RadioButton
                    size="100"
                    checked={isSelected}
                    variant={isSelected ? 'Primary' : 'Secondary'}
                    onClick={() => handleNewVote(item.id)}
                  />
                )}
                <Box justifyContent="SpaceBetween" grow="Yes" alignItems="Center">
                  <Text>{optionBody}</Text>

                  {(isDisclosed || isEnded) && (
                    <Text size="T200" style={{ color: color.SurfaceVariant.OnContainer }}>
                      {`(${voteCount} vote${voteCount !== 1 ? 's' : ''})`}
                    </Text>
                  )}
                </Box>
              </Box>
              {(isDisclosed || isEnded) && (
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
        <Box gap="200" grow="Yes" justifyContent="SpaceBetween">
          <Text size="T200">
            {`(${totalVotes} vote${totalVotes > 1 ? 's' : ''}`}
            {totalVotes !== voters.size &&
              ` by ${voters.size} voter${voters.size !== 1 ? 's' : ''}`}
            {')'}
          </Text>
          {!isEnded && canEnd && (
            <Button size="300" radii="400" variant="Critical" onClick={handleEndVote}>
              End Poll
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
