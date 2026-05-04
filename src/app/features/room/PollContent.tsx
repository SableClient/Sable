import type { MatrixEvent, Relations, Room } from '$types/matrix-sdk';
import { useCallback, useEffect, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  config,
  Header,
  Line,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  ProgressBar,
  RadioButton,
  Text,
} from 'folds';
import {
  M_POLL_END,
  M_POLL_KIND_DISCLOSED,
  M_POLL_KIND_UNDISCLOSED,
  M_POLL_RESPONSE,
  M_POLL_START,
} from 'matrix-js-sdk/lib/@types/polls';
import type { PollAnswer } from 'matrix-js-sdk/lib/@types/polls';
import { M_TEXT } from 'matrix-js-sdk/lib/@types/extensible_events';
import { PollEvent as PollModelEvent } from 'matrix-js-sdk/lib/models/poll';
import type { Poll } from 'matrix-js-sdk/lib/models/poll';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { tallyCounts } from '$hooks/usePollTally';
import { MessageLayout } from '$state/settings';
import { Attachment, AttachmentBox, AttachmentContent } from '$components/message/attachment';
import { stopPropagation } from '$utils/keyboard';

type PollContentProps = {
  mEvent: MatrixEvent;
  room: Room;
  messageLayout?: MessageLayout;
};

function pluralize(amount: number, noun: string): string {
  return amount === 1 ? noun : `${noun}s`;
}

function getAnswerText(answer: PollAnswer): string {
  const raw = answer as unknown as Record<string, unknown>;
  return (
    (raw[M_TEXT.name] as string | undefined) ?? (raw[M_TEXT.altName] as string | undefined) ?? ''
  );
}

export function PollContent({ mEvent, room, messageLayout }: PollContentProps) {
  const mx = useMatrixClient();
  const content = mEvent.getContent();

  const pollRaw = (content[M_POLL_START.name] ?? content[M_POLL_START.altName]) as
    | Record<string, unknown>
    | undefined;

  const question: string = (() => {
    if (!pollRaw) return '(Poll)';
    const q = pollRaw.question as Record<string, unknown> | undefined;
    if (!q) return '(Poll)';
    return (
      (q[M_TEXT.name] as string | undefined) ??
      (q[M_TEXT.altName] as string | undefined) ??
      '(Poll)'
    );
  })();

  const answers = (pollRaw?.answers as PollAnswer[] | undefined) ?? [];
  const maxSelections = (pollRaw?.max_selections as number | undefined) ?? 1;
  const kind = (pollRaw?.kind as string | undefined) ?? M_POLL_KIND_DISCLOSED.name;
  const isDisclosed = kind === M_POLL_KIND_DISCLOSED.name || kind === M_POLL_KIND_DISCLOSED.altName;
  const isUndisclosed =
    kind === M_POLL_KIND_UNDISCLOSED.name || kind === M_POLL_KIND_UNDISCLOSED.altName;

  const eventId = mEvent.getId() ?? '';
  const roomId = room.roomId;
  const myUserId = mx.getUserId() ?? '';
  const senderId = mEvent.getSender() ?? '';

  const [relations, setRelations] = useState<Relations | undefined>(undefined);
  const [isEnded, setIsEnded] = useState(false);
  const [openEndModal, setOpenEndModal] = useState(false);

  useEffect(() => {
    const roomWithPolls = room as unknown as { polls: Map<string, Poll> };
    const poll = roomWithPolls.polls.get(eventId);

    if (poll) {
      setIsEnded(poll.isEnded);

      poll
        .getResponses()
        .then((rels) => setRelations(rels))
        .catch(console.warn);

      const onResponses = (rels: Relations) => setRelations(rels);
      const onEnd = () => setIsEnded(true);
      poll.on(PollModelEvent.Responses, onResponses);
      poll.on(PollModelEvent.End, onEnd);
      return () => {
        poll.off(PollModelEvent.Responses, onResponses);
        poll.off(PollModelEvent.End, onEnd);
      };
    }

    return undefined;
  }, [room, eventId]);

  const tally = tallyCounts(answers, relations, myUserId, maxSelections);
  const canShowResults = isDisclosed || (isUndisclosed && isEnded);
  const outlined = messageLayout === MessageLayout.Bubble;

  const handleVote = useCallback(
    async (answerId: string) => {
      if (isEnded) return;
      const isSelected = tally.myAnswers.includes(answerId);
      let newAnswers: string[];
      if (maxSelections === 1) {
        newAnswers = isSelected ? [] : [answerId];
      } else {
        newAnswers = isSelected
          ? tally.myAnswers.filter((id) => id !== answerId)
          : [...tally.myAnswers, answerId].slice(0, maxSelections);
      }

      const voteContent: Record<string, unknown> = {
        [M_POLL_RESPONSE.name]: { answers: newAnswers },
        [M_POLL_RESPONSE.altName]: { answers: newAnswers },
        'm.relates_to': {
          rel_type: 'm.reference',
          event_id: eventId,
        },
      };

      type SendEventContent = Parameters<typeof mx.sendEvent>[3];
      await (
        mx as unknown as {
          sendEvent(
            roomId: string,
            threadId: null,
            eventType: string,
            content: SendEventContent
          ): Promise<unknown>;
        }
      ).sendEvent(roomId, null, M_POLL_RESPONSE.name, voteContent as unknown as SendEventContent);
    },
    [mx, roomId, eventId, tally.myAnswers, maxSelections, isEnded]
  );

  const handleEndPoll = useCallback(async () => {
    type SendEventContent = Parameters<typeof mx.sendEvent>[3];
    await (
      mx as unknown as {
        sendEvent(
          roomId: string,
          threadId: null,
          eventType: string,
          content: SendEventContent
        ): Promise<unknown>;
      }
    ).sendEvent(roomId, null, M_POLL_END.name, {
      [M_POLL_END.name]: {},
      [M_POLL_END.altName]: {},
      'm.relates_to': { rel_type: 'm.reference', event_id: eventId },
      'm.text': 'The poll has ended.',
    } as unknown as SendEventContent);
    setOpenEndModal(false);
  }, [mx, roomId, eventId]);

  const pollLabel = isDisclosed ? 'Poll' : 'Undisclosed poll';

  return (
    <>
      <Overlay open={openEndModal} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setOpenEndModal(false),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal size="300" style={{ height: 'fit-content' }}>
              <Header
                size="600"
                style={{ padding: `0 ${config.space.S500}`, marginTop: config.space.S100 }}
              >
                <Text size="H4" truncate>
                  End poll
                </Text>
              </Header>
              <Box
                direction="Column"
                gap="500"
                style={{ padding: `0 ${config.space.S500} ${config.space.S500}` }}
              >
                <Text size="T300">
                  Are you sure you want to end this poll? This will reveal the results, and no one
                  will be able to vote anymore.
                </Text>
                <Box direction="Row" gap="500" style={{ width: '100%' }}>
                  <Button
                    variant="Secondary"
                    fill="Soft"
                    onClick={() => setOpenEndModal(false)}
                    style={{ width: '100%' }}
                  >
                    <Text size="B400">Cancel</Text>
                  </Button>
                  <Button
                    variant="Primary"
                    fill="Soft"
                    onClick={handleEndPoll}
                    style={{ width: '100%' }}
                  >
                    <Text size="B400">End poll</Text>
                  </Button>
                </Box>
              </Box>
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <Attachment outlined={outlined}>
        <Box alignItems="Center" style={{ padding: config.space.S300 }}>
          <Box grow="Yes">
            <Text size="T300">
              {pollLabel}
              {isEnded ? ' (ended)' : ''}
            </Text>
          </Box>
          <Text size="C400">
            {tally.totalVoters} {pluralize(tally.totalVoters, 'vote')}
          </Text>
        </Box>
        <AttachmentBox>
          <AttachmentContent>
            <Box gap="300" direction="Column">
              <Text size="H5">{question}</Text>
              <Line />
              {answers.map((answer, idx) => {
                const text = getAnswerText(answer);
                const isSelected = tally.myAnswers.includes(answer.id);
                const voteCount = tally.counts.get(answer.id) ?? 0;
                return (
                  <Box key={answer.id} direction="Row" gap="300">
                    <Box direction="Row" alignItems="Center">
                      <RadioButton
                        size="50"
                        disabled={isEnded}
                        onClick={() => handleVote(answer.id)}
                        checked={isSelected}
                      />
                    </Box>
                    <Box direction="Column" grow="Yes" gap="200">
                      <Box direction="Row" gap="200" alignItems="Center" style={{ width: '100%' }}>
                        <Box
                          grow="Yes"
                          display="InlineFlex"
                          direction="Row"
                          gap="200"
                          alignItems="Center"
                        >
                          <Text align="Left">{text || `Option ${idx + 1}`}</Text>
                        </Box>
                        {canShowResults && (
                          <Text align="Right">
                            {voteCount} {pluralize(voteCount, 'vote')}
                          </Text>
                        )}
                      </Box>
                      {canShowResults && (
                        <ProgressBar
                          style={{ width: '100%' }}
                          as="div"
                          variant={isSelected ? 'Primary' : 'Secondary'}
                          max={tally.totalVoters}
                          value={voteCount}
                          fill="Soft"
                          min={0}
                          outlined={outlined}
                        />
                      )}
                    </Box>
                  </Box>
                );
              })}
              {isUndisclosed && !isEnded && senderId === myUserId && (
                <>
                  <Line />
                  <Button onClick={() => setOpenEndModal(true)}>
                    <Text size="B400">End poll</Text>
                  </Button>
                </>
              )}
            </Box>
          </AttachmentContent>
        </AttachmentBox>
      </Attachment>
    </>
  );
}
