import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Header,
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Button,
  Input,
  Chip,
  Switch,
  color,
} from 'folds';
import { stopPropagation } from '$utils/keyboard';
import type { ChangeEventHandler, KeyboardEventHandler } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { PollAnswerItem } from '$components/message/PollEvent';
import { randomStr } from '$utils/common';
import { SettingTile } from '$components/setting-tile';
import { SequenceCard } from '$components/sequence-card';
import { SequenceCardStyle } from '$features/settings/styles.css';
import type { IContent, MatrixClient, Room, TimelineEvents } from 'matrix-js-sdk';
import {
  M_POLL_KIND_DISCLOSED,
  M_POLL_KIND_UNDISCLOSED,
  M_POLL_START,
  M_TEXT,
} from 'matrix-js-sdk';
import { isKeyHotkey } from 'is-hotkey';
import * as css from './PollDialog.css';
import type { IReplyDraft } from '$state/room/roomInputDrafts';
import { getReplyContent } from '../RoomInput';

type PollDialogProps = {
  onCancel: () => void;
  mx: MatrixClient;
  room: Room;
  replyDraft?: IReplyDraft;
  clearReplyDraft?: () => void;
};

type ErrorProps = {
  errorcode: 'title' | 'option' | 'maxOptions';
  errorString: string;
};

export function PollDialog({ onCancel, mx, room, replyDraft, clearReplyDraft }: PollDialogProps) {
  const roomId = room.roomId;
  const [isDisclosed, setIsDisclosed] = useState(true);
  const [maxSelections, setMaxSelections] = useState(1);
  const [inputValue, setInputValue] = useState(1);
  const title = useRef<string>('');
  const [error, setError] = useState<ErrorProps | undefined>(undefined);
  const [answers, setAnswers] = useState<PollAnswerItem[]>([
    {
      id: randomStr(),
      [M_TEXT.name]: '',
    },
    {
      id: randomStr(),
      [M_TEXT.name]: '',
    },
  ]);
  const addOption = useCallback(() => {
    if (maxSelections === answers.length) {
      setMaxSelections(maxSelections + 1);
      setInputValue(maxSelections + 1);
    }
    setAnswers([
      ...answers,
      {
        id: randomStr(),
        [M_TEXT.name]: '',
      },
    ]);
  }, [answers, setAnswers, maxSelections, setMaxSelections]);
  const delOption = useCallback(
    (id: string) => {
      if (answers.length > 2) {
        if (maxSelections === answers.length) {
          setMaxSelections(maxSelections - 1);
          setInputValue(maxSelections - 1);
        }
        setAnswers(answers.filter((answer) => answer.id !== id));
      }
    },
    [answers, setAnswers, maxSelections, setMaxSelections]
  );

  const handleSubmit = () => {
    if (title.current.length === 0) {
      setError({ errorcode: 'title', errorString: 'Missing Title' });
      return;
    }
    const emptyAnswers = answers.filter((item) => item['org.matrix.msc1767.text'].length === 0);
    if (emptyAnswers.length > 0) {
      setError({
        errorcode: 'option',
        errorString: `Missing option text${emptyAnswers.length > 1 ? 's' : ''}`,
      });
      return;
    }
    if (maxSelections < 1 || maxSelections > answers.length) {
      setError({
        errorcode: 'maxOptions',
        errorString: `You can only have between 1 and ${answers.length} selections`,
      });
      return;
    }
    // its an IContent instead of the proper object because the proper object doesnt work w other clients :>
    const pollContent: IContent = {
      [M_POLL_START.name]: {
        question: {
          [M_TEXT.name]: title.current,
          body: title.current,
          msgtype: 'm.text',
        },
        kind: isDisclosed ? M_POLL_KIND_DISCLOSED.name : M_POLL_KIND_UNDISCLOSED.name,
        max_selections: maxSelections,
        answers: answers,
      },
      [M_TEXT.name]: `New poll\n Question: ${title.current}\nAnswers:\n ${answers.map((item) => item[M_TEXT.name]).join('\n')}`,
    };
    if (replyDraft && clearReplyDraft) {
      pollContent['m.relates_to'] = getReplyContent(replyDraft, room);
      clearReplyDraft();
    }

    mx.sendEvent(
      roomId,
      M_POLL_START.name as keyof TimelineEvents,
      pollContent as TimelineEvents[keyof TimelineEvents]
    );

    onCancel();
  };

  const handleMaxOptions: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    const parsed = Number.parseInt(val, 10);
    setInputValue(parsed);
    if (!Number.isNaN(parsed)) setMaxSelections(parsed);
  };
  const handleMaxKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('enter', evt)) {
      (evt.target as HTMLInputElement).blur();
      if (inputValue < 1) setInputValue(1);
      if (inputValue > answers.length) setInputValue(1);
    }
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
          <Dialog variant="Surface" className={css.PollDialogBody}>
            <Header className={css.PollDialogHeader} variant="Surface" size="500">
              <Box grow="Yes" gap="200">
                <Icon src={Icons.UnorderList} />
                <Text size="H4">{`New Poll ${replyDraft ? '(reply / thread)' : ''}`} </Text>
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
            <Box direction="Column" gap="500" className={css.PollDialogTitle}>
              <Box direction="Column">
                <Text> Title </Text>
                <Input
                  variant={error?.errorcode === 'title' ? 'Critical' : 'SurfaceVariant'}
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
                <Box direction="Column" gap="100" className={css.PollDialogAnswerBody}>
                  {answers.map((item, index) => (
                    <Box direction="Row" grow="Yes" shrink="No" alignItems="Center" key={item.id}>
                      <Input
                        variant={
                          error?.errorcode === 'option' && item[M_TEXT.name].length === 0
                            ? 'Critical'
                            : 'SurfaceVariant'
                        }
                        size="400"
                        className={css.PollDialogAnswerInput}
                        aria-label={`Type Option ${index + 1}`}
                        onChange={(evt) => {
                          let newAnswers = answers;
                          newAnswers[index] = {
                            id: answers[index]?.id ?? randomStr(),
                            [M_TEXT.name]: evt.currentTarget.value.trim() ?? '',
                          };
                          setAnswers(newAnswers);
                        }}
                        placeholder={`Type Option ${index + 1}`}
                        after={
                          <IconButton
                            fill="None"
                            size="400"
                            disabled={answers.length <= 2}
                            aria-disabled={answers.length <= 2}
                            aria-label="Remove Option"
                            onClick={() => delOption(item.id)}
                          >
                            <Icon size="50" src={Icons.Minus} />
                          </IconButton>
                        }
                      />
                    </Box>
                  ))}
                </Box>
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
                        className={css.PollDialogMaxSelectionNumber}
                        variant={error?.errorcode === 'maxOptions' ? 'Critical' : 'SurfaceVariant'}
                        size="300"
                        radii="300"
                        type="number"
                        min="1"
                        max={answers.length}
                        value={inputValue}
                        onChange={handleMaxOptions}
                        onKeyDown={handleMaxKeyDown}
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
                    onChange={(e) => {
                      const val = Number.parseInt(e.target.value);
                      if (val) {
                        setInputValue(val);
                        setMaxSelections(val);
                      }
                    }}
                    className={css.PollDialogMaxSelectionSlider}
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
              {!!error && (
                <Text align="Center" size="B500" style={{ color: color.Critical.OnContainer }}>
                  {error.errorString}
                </Text>
              )}
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
