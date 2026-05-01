import type { FormEventHandler } from 'react';
import { useCallback, useRef, useState, useEffect } from 'react';
import type { MatrixError, StateEvents, TimelineEvents } from '$types/matrix-sdk';
import {
  Box,
  Chip,
  Icon,
  Icons,
  IconButton,
  Text,
  config,
  Button,
  Spinner,
  color,
  TextArea as TextAreaComponent,
  Input,
} from 'folds';
import { Page, PageHeader } from '$components/page';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoom } from '$hooks/useRoom';
import { useAlive } from '$hooks/useAlive';
import { useTextAreaCodeEditor } from '$hooks/useTextAreaCodeEditor';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { syntaxErrorPosition } from '$utils/dom';
import { Cursor } from '$plugins/text-area';

const EDITOR_INTENT_SPACE_COUNT = 2;

export type SendRoomEventProps = {
  type?: string;
  stateKey?: string;
  requestClose: () => void;
};
export function SendRoomEvent({ type, stateKey, requestClose }: SendRoomEventProps) {
  const mx = useMatrixClient();
  const room = useRoom();
  const alive = useAlive();
  const composeStateEvent = typeof stateKey === 'string';

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [jsonError, setJSONError] = useState<SyntaxError>();
  const { handleKeyDown, operations, getTarget } = useTextAreaCodeEditor(
    textAreaRef,
    EDITOR_INTENT_SPACE_COUNT
  );

  const [submitState, submit] = useAsyncCallback<
    object,
    MatrixError,
    [string, string | undefined, object]
  >(
    useCallback(
      (evtType, evtStateKey, evtContent) => {
        if (typeof evtStateKey === 'string') {
          return mx.sendStateEvent(
            room.roomId,
            evtType as keyof StateEvents,
            evtContent as StateEvents[keyof StateEvents],
            evtStateKey
          );
        }
        return mx.sendEvent(
          room.roomId,
          evtType as keyof TimelineEvents,
          evtContent as TimelineEvents[keyof TimelineEvents]
        );
      },
      [mx, room]
    )
  );
  const submitting = submitState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (submitting) return;

    const target = evt.target as HTMLFormElement | undefined;
    const typeInput = target?.typeInput as HTMLInputElement | undefined;
    const stateKeyInput = target?.stateKeyInput as HTMLInputElement | undefined;
    const contentTextArea = target?.contentTextArea as HTMLTextAreaElement | undefined;
    if (!typeInput || !contentTextArea) return;

    const evtType = typeInput.value;
    const evtStateKey = stateKeyInput?.value;
    const contentStr = contentTextArea.value.trim();

    let parsedContent: object;
    try {
      parsedContent = JSON.parse(contentStr);
    } catch (e) {
      setJSONError(e as SyntaxError);
      return;
    }
    setJSONError(undefined);

    if (parsedContent === null) {
      return;
    }

    submit(evtType, evtStateKey, parsedContent).then(() => {
      if (alive()) {
        requestClose();
      }
    });
  };

  useEffect(() => {
    if (jsonError) {
      const errorPosition = syntaxErrorPosition(jsonError) ?? 0;
      const cursor = new Cursor(errorPosition, errorPosition, 'none');
      operations.select(cursor);
      getTarget()?.focus();
    }
  }, [jsonError, operations, getTarget]);

  return (
    <Page>
      <PageHeader outlined={false} balance>
        <Box alignItems="Center" grow="Yes" gap="200">
          <Box alignItems="Inherit" grow="Yes" gap="200">
            <Chip
              size="500"
              radii="Pill"
              onClick={requestClose}
              before={<Icon size="100" src={Icons.ArrowLeft} />}
            >
              <Text size="T300">Developer Tools</Text>
            </Chip>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes" direction="Column">
        <Box
          as="form"
          onSubmit={handleSubmit}
          grow="Yes"
          style={{ padding: config.space.S400 }}
          direction="Column"
          gap="400"
          aria-disabled={submitting}
        >
          <Box shrink="No" direction="Column" gap="100">
            <Text size="L400">{composeStateEvent ? 'State Event Type' : 'Message Event Type'}</Text>
            <Box gap="300">
              <Box grow="Yes" direction="Column">
                <Input
                  variant="Background"
                  name="typeInput"
                  size="400"
                  radii="300"
                  readOnly={submitting}
                  defaultValue={type}
                  required
                />
              </Box>
              <Button
                variant="Success"
                size="400"
                radii="300"
                type="submit"
                disabled={submitting}
                before={submitting && <Spinner variant="Primary" fill="Solid" size="300" />}
              >
                <Text size="B400">Send</Text>
              </Button>
            </Box>

            {submitState.status === AsyncStatus.Error && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                <b>{submitState.error.message}</b>
              </Text>
            )}
          </Box>
          {composeStateEvent && (
            <Box shrink="No" direction="Column" gap="100">
              <Text size="L400">State Key (Optional)</Text>
              <Input
                variant="Background"
                name="stateKeyInput"
                size="400"
                radii="300"
                readOnly={submitting}
                defaultValue={stateKey}
              />
            </Box>
          )}
          <Box grow="Yes" direction="Column" gap="100">
            <Box shrink="No">
              <Text size="L400">JSON Content</Text>
            </Box>
            <TextAreaComponent
              ref={textAreaRef}
              name="contentTextArea"
              style={{ fontFamily: 'var(--font-monospace)' }}
              onKeyDown={handleKeyDown}
              resize="None"
              spellCheck="false"
              required
              readOnly={submitting}
            />
            {jsonError && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                <b>
                  {jsonError.name}: {jsonError.message}
                </b>
              </Text>
            )}
          </Box>
        </Box>
      </Box>
    </Page>
  );
}
