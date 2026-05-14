import { useCallback, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Switch,
  Text,
  config,
} from 'folds';
import { PollStartEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollStartEvent';
import { M_POLL_KIND_DISCLOSED, M_POLL_KIND_UNDISCLOSED } from 'matrix-js-sdk/lib/@types/polls';
import type { Room } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';

const MIN_ANSWERS = 2;
const MAX_ANSWERS = 20;

let answerIdSeed = 0;
function newId(): string {
  answerIdSeed += 1;
  return `a${answerIdSeed}`;
}

type AnswerDraft = { id: string; text: string };

type PollCreatorProps = {
  room: Room;
  onClose: () => void;
};

export function PollCreator({ room, onClose }: PollCreatorProps) {
  const mx = useMatrixClient();

  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<AnswerDraft[]>([
    { id: newId(), text: '' },
    { id: newId(), text: '' },
  ]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [maxSelections, setMaxSelections] = useState(2);
  const [disclosed, setDisclosed] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const lastInputRef = useRef<HTMLInputElement>(null);

  const handleAddAnswer = useCallback(() => {
    if (answers.length >= MAX_ANSWERS) return;
    setAnswers((prev) => [...prev, { id: newId(), text: '' }]);
    requestAnimationFrame(() => lastInputRef.current?.focus());
  }, [answers.length]);

  const handleRemoveAnswer = useCallback(
    (id: string) => {
      if (answers.length <= MIN_ANSWERS) return;
      setAnswers((prev) => prev.filter((a) => a.id !== id));
    },
    [answers.length]
  );

  const handleAnswerChange = useCallback((id: string, text: string) => {
    setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, text } : a)));
  }, []);

  const handleMultiSelectToggle = useCallback((v: boolean) => {
    setMultiSelect(v);
    if (v) setMaxSelections(2);
  }, []);

  const handleSend = useCallback(async () => {
    const q = question.trim();
    if (!q) {
      setError('Please enter a question.');
      return;
    }
    const validAnswers = answers.map((a) => a.text.trim()).filter(Boolean);
    if (validAnswers.length < MIN_ANSWERS) {
      setError(`Please fill in at least ${MIN_ANSWERS} answer options.`);
      return;
    }

    const kind = disclosed ? M_POLL_KIND_DISCLOSED : M_POLL_KIND_UNDISCLOSED;
    const maxSel = multiSelect ? Math.max(2, Math.min(maxSelections, validAnswers.length)) : 1;
    const pollEvent = PollStartEvent.from(q, validAnswers, kind, maxSel);
    const serialized = pollEvent.serialize();

    setSending(true);
    setError(undefined);
    try {
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
      ).sendEvent(
        room.roomId,
        null,
        serialized.type,
        serialized.content as unknown as SendEventContent
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send poll.');
      setSending(false);
    }
  }, [question, answers, multiSelect, maxSelections, disclosed, mx, room.roomId, onClose]);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onClose,
            clickOutsideDeactivates: true,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: 1,
                borderBottomStyle: 'solid',
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes" alignItems="Center" gap="200">
                <Icon src={Icons.OrderList} />
                <Text size="H4">Create Poll</Text>
              </Box>
              <IconButton onClick={onClose} variant="Surface" size="300" radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>

            <Box direction="Column" style={{ maxHeight: '80vh', overflow: 'hidden' }}>
              <Scroll>
                <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
                  {/* Question */}
                  <Box direction="Column" gap="100">
                    <Text size="L400">Question</Text>
                    <Input
                      style={{ width: '100%' }}
                      variant="Background"
                      size="400"
                      radii="300"
                      placeholder="Ask something…"
                      value={question}
                      onChange={(e) => setQuestion((e.target as HTMLInputElement).value)}
                      maxLength={340}
                    />
                  </Box>

                  {/* Answers */}
                  <Box direction="Column" gap="200">
                    <Text size="L400">Options</Text>
                    {answers.map((ans, idx) => (
                      <Box key={ans.id} gap="200" alignItems="Center">
                        <Box grow="Yes">
                          <Input
                            style={{ width: '100%' }}
                            ref={idx === answers.length - 1 ? lastInputRef : undefined}
                            variant="Background"
                            size="400"
                            radii="300"
                            placeholder={`Option ${idx + 1}`}
                            value={ans.text}
                            onChange={(e) =>
                              handleAnswerChange(ans.id, (e.target as HTMLInputElement).value)
                            }
                            maxLength={340}
                          />
                        </Box>
                        <IconButton
                          onClick={() => handleRemoveAnswer(ans.id)}
                          variant="Surface"
                          size="300"
                          radii="300"
                          disabled={answers.length <= MIN_ANSWERS}
                          aria-label={`Remove option ${idx + 1}`}
                        >
                          <Icon src={Icons.Cross} size="100" />
                        </IconButton>
                      </Box>
                    ))}
                    {answers.length < MAX_ANSWERS && (
                      <Button
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                        before={<Icon src={Icons.Plus} size="100" />}
                        onClick={handleAddAnswer}
                      >
                        <Text size="B300">Add option</Text>
                      </Button>
                    )}
                  </Box>

                  {/* Multi-select */}
                  <Box gap="300" alignItems="Center">
                    <Switch
                      variant="Primary"
                      value={multiSelect}
                      onChange={handleMultiSelectToggle}
                    />
                    <Box direction="Column" grow="Yes">
                      <Text size="T300">Allow multiple selections</Text>
                    </Box>
                    {multiSelect && (
                      <Box gap="100" alignItems="Center">
                        <Text size="T300">Up to</Text>
                        <Input
                          variant="Background"
                          size="300"
                          radii="300"
                          type="number"
                          min={2}
                          max={answers.length}
                          value={String(maxSelections)}
                          onChange={(e) => {
                            const v = parseInt((e.target as HTMLInputElement).value, 10);
                            if (!Number.isNaN(v)) {
                              setMaxSelections(Math.max(2, Math.min(v, answers.length)));
                            }
                          }}
                          style={{ width: '4rem' }}
                        />
                      </Box>
                    )}
                  </Box>

                  {/* Disclosed toggle */}
                  <Box gap="300" alignItems="Center">
                    <Switch variant="Primary" value={disclosed} onChange={setDisclosed} />
                    <Box direction="Column">
                      <Text size="T300">{disclosed ? 'Disclosed poll' : 'Undisclosed poll'}</Text>
                      <Text size="T200" style={{ opacity: 0.6 }}>
                        {disclosed
                          ? 'Results visible while voting'
                          : 'Results hidden until poll ends'}
                      </Text>
                    </Box>
                  </Box>

                  {error && (
                    <Text size="T300" style={{ color: 'var(--mx-tc-danger)' }}>
                      {error}
                    </Text>
                  )}
                </Box>
              </Scroll>

              {/* Footer */}
              <Box
                gap="200"
                justifyContent="End"
                style={{
                  padding: `${config.space.S200} ${config.space.S400}`,
                  borderTopWidth: 1,
                  borderTopStyle: 'solid',
                }}
              >
                <Button
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  onClick={onClose}
                  disabled={sending}
                >
                  <Text size="B400">Cancel</Text>
                </Button>
                <Button variant="Primary" radii="300" onClick={handleSend} disabled={sending}>
                  <Text size="B400">{sending ? 'Sending…' : 'Send Poll'}</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
