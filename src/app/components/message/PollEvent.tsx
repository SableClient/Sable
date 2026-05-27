import { useMatrixClient } from '$hooks/useMatrixClient';
import { Box, config, Header, Icon, Icons, Menu, MenuItem } from 'folds';
import type { MatrixEvent } from 'matrix-js-sdk';

type PollEventProps = {
  content: Record<string, unknown>;
  mEvent?: MatrixEvent;
};

type PollAnswers = {
  id: string;
  'org.matrix.msc1767.text': string;
};

type PollVotes = {
  [vote: string]: number;
};
export function PollEvent({ content, mEvent }: PollEventProps) {
  const mx = useMatrixClient();
  if (!content || !mEvent) return null;

  const roomId = mEvent.getRoomId();
  const room = mx.getRoom(roomId);
  const eventId = mEvent.getId();

  const poll = content['org.matrix.msc3381.poll.start'];
  const question = (poll as { question?: string })?.question;
  const questionBody = (question as { body?: string })?.body ?? '';
  const answers = (poll as { answers: PollAnswers[] })?.answers;
  const maxSelections = (poll as { max_selections: number })?.max_selections;
  const isDisclosed = (poll as { kind: string })?.kind === 'org.matrix.msc3381.poll.disclosed';
  // oxlint-disable-next-line no-console
  console.log(content);

  let votes: PollVotes = {};
  answers.forEach((item) => (votes[item.id] = 0));

  const childEvents = room
    ?.getUnfilteredTimelineSet()
    .relations.getAllChildEventsForEvent(eventId ?? '');
  const sortedChildEvents = childEvents?.toSorted((a: MatrixEvent, b:MatrixEvent) =>
    a.event.origin_server_ts && b.event.origin_server_ts ? b.event.origin_server_ts - a.event.origin_server_ts : 0
  );
  let filteredChildEvents: MatrixEvent[] = [];
  sortedChildEvents?.forEach((item) => {
    if (!filteredChildEvents.find((fCE) => fCE.event.sender === item.event.sender))
      filteredChildEvents.push(item);
  });
  // oxlint-disable-next-line no-console
  console.log(childEvents, sortedChildEvents);

  filteredChildEvents?.map((item) => {
    const VoteContent = item.getContent();
    const response = VoteContent['org.matrix.msc3381.poll.response'];
    const selections = response.answers;
    if (selections.length > maxSelections) return;

    selections.forEach((selection: string) => {
      if (votes[selection] !== undefined) votes[selection] += 1;
    });
  });
  // oxlint-disable-next-line no-console
  console.log('answers', votes, maxSelections, isDisclosed);
  return (
    <Box>
      <Menu>
        <Header variant="Primary" style={{ padding: config.space.S400 }}>
          <Box gap="200">
            <Icon size="50" src={Icons.UnorderList} />
            {questionBody}
          </Box>
        </Header>
        {answers.map((item) => {
          const optionBody = item['org.matrix.msc1767.text'];
          const voteCount = votes[item.id];
          return (
            <MenuItem key={item.id}>
              <p>
                {optionBody} has {voteCount}
              </p>
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
}
