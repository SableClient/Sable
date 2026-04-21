import { FormEventHandler, useId, useMemo, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  config,
} from 'folds';
import { stopPropagation } from '$utils/keyboard';
import { M_POLL_KIND_DISCLOSED, M_POLL_KIND_UNDISCLOSED } from '$types/matrix-sdk';
import * as css from './PollCreatorDialog.css';

const MAX_ANSWERS = 20;
const MIN_ANSWERS = 2;

type ExpiryPreset = 'none' | '1h' | '12h' | '24h' | '48h' | '1w' | 'custom';

const EXPIRY_PRESETS: { value: ExpiryPreset; label: string }[] = [
  { value: 'none', label: 'No limit' },
  { value: '1h', label: '1 hour' },
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
  { value: '48h', label: '48 hours' },
  { value: '1w', label: '1 week' },
  { value: 'custom', label: 'Custom…' },
];

const HOUR_MS = 3_600_000;

export type PollCreatorContent = {
  question: string;
  answers: Array<{ id: string; text: string }>;
  kind: string;
  maxSelections: number;
  showVoterNames: boolean;
  closesAt?: number;
};

type PollCreatorDialogProps = {
  onCancel: () => void;
  onSubmit: (content: PollCreatorContent) => void;
};

export function PollCreatorDialog({ onCancel, onSubmit }: PollCreatorDialogProps) {
  const questionId = useId();
  const maxSelectionsId = useId();
  const [question, setQuestion] = useState('');
  const [maxSelections, setMaxSelections] = useState(1);
  const [answers, setAnswers] = useState<{ id: string; text: string }[]>(() => [
    { id: crypto.randomUUID(), text: '' },
    { id: crypto.randomUUID(), text: '' },
  ]);
  const [kind, setKind] = useState<string>(
    M_POLL_KIND_DISCLOSED.altName ?? 'org.matrix.msc3381.poll.disclosed'
  );
  const [showVoterNames, setShowVoterNames] = useState(true);
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>('none');
  const [customExpiry, setCustomExpiry] = useState('');
  const [error, setError] = useState<string>();
  const lastInputRef = useRef<HTMLInputElement>(null);

  const minDatetime = useMemo(() => {
    const d = new Date(Date.now() + 60_000);
    // datetime-local expects local time, not UTC — build YYYY-MM-DDTHH:MM manually
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiryPreset]);

  const computeClosesAt = (): number | undefined => {
    const now = Date.now();
    switch (expiryPreset) {
      case '1h':
        return now + HOUR_MS;
      case '12h':
        return now + 12 * HOUR_MS;
      case '24h':
        return now + 24 * HOUR_MS;
      case '48h':
        return now + 48 * HOUR_MS;
      case '1w':
        return now + 7 * 24 * HOUR_MS;
      case 'custom': {
        const ts = customExpiry ? new Date(customExpiry).getTime() : NaN;
        return Number.isFinite(ts) && ts > Date.now() ? ts : undefined;
      }
      default:
        return undefined;
    }
  };

  const handleAddAnswer = () => {
    if (answers.length >= MAX_ANSWERS) return;
    setAnswers((prev) => [...prev, { id: crypto.randomUUID(), text: '' }]);
    // Focus the new answer field on next render
    setTimeout(() => lastInputRef.current?.focus(), 0);
  };

  const handleRemoveAnswer = (id: string) => {
    setAnswers((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAnswerChange = (id: string, value: string) => {
    setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, text: value } : a)));
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError('Please enter a question.');
      return;
    }
    const validAnswers = answers.map((a) => ({ ...a, text: a.text.trim() })).filter((a) => a.text);
    if (validAnswers.length < MIN_ANSWERS) {
      setError(`Please add at least ${MIN_ANSWERS} answers.`);
      return;
    }
    const clampedMaxSelections = Math.min(Math.max(1, maxSelections), validAnswers.length);
    if (expiryPreset === 'custom') {
      const ts = customExpiry ? new Date(customExpiry).getTime() : NaN;
      if (!Number.isFinite(ts) || ts <= Date.now()) {
        setError('Please choose a future date and time for the custom expiry.');
        return;
      }
    }
    setError(undefined);
    onSubmit({
      question: trimmedQuestion,
      answers: validAnswers,
      kind,
      maxSelections: clampedMaxSelections,
      showVoterNames,
      closesAt: computeClosesAt(),
    });
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Create Poll</Text>
              </Box>
              <IconButton
                size="300"
                onClick={onCancel}
                radii="300"
                title="Cancel"
                aria-label="Cancel creating poll"
              >
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>

            <form onSubmit={handleSubmit} noValidate>
              <div className={css.DialogContent}>
                {/* Question */}
                <Box direction="Column" gap="100">
                  <Text as="label" htmlFor={questionId} size="L400" priority="400">
                    Question
                  </Text>
                  <Input
                    id={questionId}
                    value={question}
                    onChange={(e) => setQuestion((e.target as HTMLInputElement).value)}
                    placeholder="Ask a question…"
                    required
                    maxLength={340}
                    autoComplete="off"
                  />
                </Box>

                {/* Answers */}
                <Box direction="Column" gap="100">
                  <Text size="L400" priority="400">
                    Answers
                  </Text>
                  {answers.map((answer, index) => (
                    <div key={answer.id} className={css.AnswerRow}>
                      <Input
                        ref={index === answers.length - 1 ? lastInputRef : undefined}
                        className={css.AnswerInput}
                        value={answer.text}
                        onChange={(e) =>
                          handleAnswerChange(answer.id, (e.target as HTMLInputElement).value)
                        }
                        placeholder={`Option ${index + 1}`}
                        maxLength={340}
                        autoComplete="off"
                      />
                      {answers.length > MIN_ANSWERS && (
                        <IconButton
                          type="button"
                          size="300"
                          radii="300"
                          variant="SurfaceVariant"
                          title={`Remove option ${index + 1}`}
                          aria-label={`Remove option ${index + 1}`}
                          onClick={() => handleRemoveAnswer(answer.id)}
                        >
                          <Icon src={Icons.Cross} />
                        </IconButton>
                      )}
                    </div>
                  ))}
                  {answers.length < MAX_ANSWERS && (
                    <Button
                      type="button"
                      variant="Secondary"
                      size="300"
                      radii="300"
                      before={<Icon size="100" src={Icons.Plus} />}
                      onClick={handleAddAnswer}
                    >
                      <Text size="B300">Add Option</Text>
                    </Button>
                  )}
                </Box>

                {/* Max selections */}
                <Box direction="Column" gap="100">
                  <Text as="label" htmlFor={maxSelectionsId} size="L400" priority="400">
                    Max selections
                  </Text>
                  <Input
                    id={maxSelectionsId}
                    type="number"
                    min={1}
                    max={answers.length}
                    value={maxSelections}
                    onChange={(e) => {
                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!Number.isNaN(val) && val >= 1) setMaxSelections(val);
                    }}
                    style={{ width: '5rem' }}
                  />
                </Box>

                {/* Poll kind */}
                <Box direction="Column" gap="100">
                  <Text size="L400" priority="400">
                    Results visibility
                  </Text>
                  <div className={css.KindSelector}>
                    <Chip
                      type="button"
                      variant={
                        kind ===
                        (M_POLL_KIND_DISCLOSED.altName ?? 'org.matrix.msc3381.poll.disclosed')
                          ? 'Primary'
                          : 'SurfaceVariant'
                      }
                      size="400"
                      radii="300"
                      onClick={() =>
                        setKind(
                          M_POLL_KIND_DISCLOSED.altName ?? 'org.matrix.msc3381.poll.disclosed'
                        )
                      }
                      aria-pressed={
                        kind ===
                        (M_POLL_KIND_DISCLOSED.altName ?? 'org.matrix.msc3381.poll.disclosed')
                      }
                    >
                      <Text size="B300">Show live results</Text>
                    </Chip>
                    <Chip
                      type="button"
                      variant={
                        kind ===
                        (M_POLL_KIND_UNDISCLOSED.altName ?? 'org.matrix.msc3381.poll.undisclosed')
                          ? 'Primary'
                          : 'SurfaceVariant'
                      }
                      size="400"
                      radii="300"
                      onClick={() =>
                        setKind(
                          M_POLL_KIND_UNDISCLOSED.altName ?? 'org.matrix.msc3381.poll.undisclosed'
                        )
                      }
                      aria-pressed={
                        kind ===
                        (M_POLL_KIND_UNDISCLOSED.altName ?? 'org.matrix.msc3381.poll.undisclosed')
                      }
                    >
                      <Text size="B300">Hide until closed</Text>
                    </Chip>
                  </div>
                </Box>

                {/* Voter visibility */}
                <Box direction="Column" gap="100">
                  <Text size="L400" priority="400">
                    Voter visibility
                  </Text>
                  <div className={css.KindSelector}>
                    <Chip
                      type="button"
                      variant={showVoterNames ? 'Primary' : 'SurfaceVariant'}
                      size="400"
                      radii="300"
                      onClick={() => setShowVoterNames(true)}
                      aria-pressed={showVoterNames}
                    >
                      <Text size="B300">Show voters</Text>
                    </Chip>
                    <Chip
                      type="button"
                      variant={!showVoterNames ? 'Primary' : 'SurfaceVariant'}
                      size="400"
                      radii="300"
                      onClick={() => setShowVoterNames(false)}
                      aria-pressed={!showVoterNames}
                    >
                      <Text size="B300">Hide voters</Text>
                    </Chip>
                  </div>
                </Box>

                {/* Poll duration */}
                <Box direction="Column" gap="100">
                  <Text size="L400" priority="400">
                    Poll duration
                  </Text>
                  <div className={css.ExpirySelector}>
                    {EXPIRY_PRESETS.map((p) => (
                      <Chip
                        key={p.value}
                        type="button"
                        variant={expiryPreset === p.value ? 'Primary' : 'SurfaceVariant'}
                        size="400"
                        radii="300"
                        onClick={() => setExpiryPreset(p.value)}
                        aria-pressed={expiryPreset === p.value}
                      >
                        <Text size="B300">{p.label}</Text>
                      </Chip>
                    ))}
                  </div>
                  {expiryPreset === 'custom' && (
                    <input
                      type="datetime-local"
                      className={css.DatetimeInput}
                      value={customExpiry}
                      min={minDatetime}
                      onChange={(e) => setCustomExpiry((e.target as HTMLInputElement).value)}
                    />
                  )}
                </Box>

                {error && (
                  <Text size="T300" style={{ color: 'var(--mx-error-color, red)' }}>
                    {error}
                  </Text>
                )}

                {/* Actions */}
                <Box gap="200" justifyContent="End">
                  <Button
                    type="button"
                    variant="Secondary"
                    size="300"
                    radii="300"
                    onClick={onCancel}
                  >
                    <Text size="B300">Cancel</Text>
                  </Button>
                  <Button type="submit" variant="Primary" size="300" radii="300">
                    <Text size="B300">Create Poll</Text>
                  </Button>
                </Box>
              </div>
            </form>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
