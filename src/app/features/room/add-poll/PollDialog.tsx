import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Header,
  config,
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Button,
  Input,
  Chip,
  Switch,
  toRem,
  color,
} from 'folds';
import { stopPropagation } from '$utils/keyboard';
import type { ChangeEventHandler } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { PollAnswerItem } from '$components/message/PollEvent';
import { randomStr } from '$utils/common';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';
import { SequenceCardStyle } from '$features/settings/styles.css';
import type { IContent, MatrixClient } from 'matrix-js-sdk';
import { M_POLL_KIND_DISCLOSED, M_POLL_KIND_UNDISCLOSED, M_POLL_START } from 'matrix-js-sdk';

type PollDialogProps = {
  onCancel: () => void;
  mx: MatrixClient;
  roomId: string;
};

export function PollDialog({ onCancel, mx, roomId }: PollDialogProps) {
  const [isDisclosed, setIsDisclosed] = useState(true);
  const [maxSelections, setMaxSelections] = useState(1);
  const title = useRef<string>('');
  const [answers, setAnswers] = useState<PollAnswerItem[]>([
    {
      id: randomStr(),
      'org.matrix.msc1767.text': '',
    },
    {
      id: randomStr(),
      'org.matrix.msc1767.text': '',
    },
  ]);
  const addOption = useCallback(() => {
    if(maxSelections === answers.length)
      setMaxSelections(maxSelections+1)
    setAnswers([
      ...answers,
      {
        id: randomStr(),
        'org.matrix.msc1767.text': '',
      },
    ]);
  }, [answers, setAnswers, maxSelections, setMaxSelections]);

  const handleSubmit = () => {
    // its an IContent instead of the proper object because the proper object doesnt work w other clients :>
    const pollContent: IContent = {
    [M_POLL_START.name]: {
      "question": {
        "org.matrix.msc1767.text": title.current,
        "body": title.current,
        "msgtype": "m.text"
      },
      "kind": isDisclosed ? M_POLL_KIND_DISCLOSED.name : M_POLL_KIND_UNDISCLOSED.name,
      "max_selections": maxSelections,
      "answers": answers,
    },
    "org.matrix.msc1767.text": `New poll\n Question: ${title.current}\nAnswers:\n ${answers.map((item) => item['org.matrix.msc1767.text']).join('\n')}`
  }
  
   /* mx.sendEvent(
      roomId,
      M_POLL_START.name as keyof TimelineEvents,
      pollContent as TimelineEvents[keyof TimelineEvents]
    );
    */
    // oxlint-disable-next-line no-console
    console.log('submit', title, answers, isDisclosed, maxSelections, pollContent);
    // onCancel();
  };

  const handleMaxOptions: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    const parsed = Number.parseInt(val, 10);
    if (!Number.isNaN(parsed)) setMaxSelections(parsed);
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
                <Text size="H4">New Poll </Text>
              </Box>
              <IconButton
                size="300"
                onClick={onCancel}
                radii="300"
                title="Cancel Creating Poll"
                aria-label="Cancel Creating Poll"
              >
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box direction="Column" gap="500" style={{ padding: config.space.S400 }}>
              <Box direction="Column">
                <Text> Title </Text>
                <Input
                  variant="SurfaceVariant"
                  size="400"
                  aria-label="Insert Title"
                  onChange={(evt) => (title.current = evt.currentTarget.value.trim())}
                  placeholder={'What should we have for dinner?'}
                />
              </Box>
              <Box direction="Column" gap="100">
                <Box direction="Row" justifyContent="SpaceBetween">
                  <Text>Options ({answers.length})</Text>
                  <Chip
                    type="submit"
                    variant="Secondary"
                    onClick={addOption}
                    aria-label="Add Option"
                    radii="Pill"
                  >
                    <Text size="B400">Add Option</Text>
                  </Chip>
                </Box>
                {answers.map((item, index) => (
                  <Box direction="Row" grow="Yes" alignItems="Center" key={item.id}>
                    <Input
                      variant="SurfaceVariant"
                      size="400"
                      style={{ width: '100%' }}
                      aria-label={`Type Option ${index+1}`}
                      onChange={(evt) =>
                        setAnswers([
                          ...answers.slice(0, index),
                          {
                            id: answers[index]?.id ?? randomStr(),
                            'org.matrix.msc1767.text': evt.currentTarget.value.trim() ?? '',
                          },
                          ...answers.slice(index + 1),
                        ])
                      }
                      placeholder={`Type Option ${index+1}`}
                      after={
                        <IconButton
                          fill="None"
                          size="400"
                          disabled={answers.length <= 2}
                          aria-disabled={answers.length <= 2}
                          aria-label="Remove Option"
                          onClick={() => {
                            if (answers.length > 2)
                              setAnswers(answers.filter((answer) => answer.id !== item.id));
                          }}
                        >
                          <Icon size="50" src={Icons.Minus} />
                        </IconButton>
                      }
                    />
                  </Box>
                ))}
              </Box>
              <Box direction="Column">
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                >
                  <SettingTile
                    title="Show results as the poll is ongoing"
                    after={
                      <Switch variant="Primary" value={isDisclosed} onChange={setIsDisclosed} />
                    }
                  />
                </SequenceCard>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="300"
                >
                  <SettingTile
                    title="Maximum amount of selections"
                    after={
                      <Input
                        style={{ width: toRem(80) }}
                        size="300"
                        radii="300"
                        type="number"
                        min="1"
                        max={maxSelections}
                        value={maxSelections}
                        onChange={handleMaxOptions}
                        outlined
                      />
                    }
                  />
                  <input
                    type="range"
                    min="1"
                    max={answers.length}
                    step="1"
                    value={maxSelections}
                    onChange={(e) => setMaxSelections(Number.parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      cursor: 'pointer',
                      appearance: 'none',
                      height: toRem(6),
                      borderRadius: config.radii.Pill,
                      backgroundColor: color.Background.ContainerLine,
                      accentColor: color.Primary.Main,
                    }}
                  />
                </SequenceCard>
              </Box>
              <Button
                type="submit"
                variant="Primary"
                onClick={handleSubmit}
                title="Create Poll"
                aria-label="Create Poll"
              >
                <Text size="B400">Create Poll</Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
