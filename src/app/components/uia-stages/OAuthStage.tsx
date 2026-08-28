import { Box, Button, color, config, Dialog, Header, IconButton, Text } from 'folds';
import { Warning, composerIcon, sizedIcon, X } from '$components/icons/phosphor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { StageComponentProps } from './types';

const POLL_COOLDOWN_MS = 1500;

type SessionState = {
  approvalSent: boolean;
  submits: number;
};

const sessionStates = new Map<string, SessionState>();

const getSessionState = (session: string | undefined): SessionState => {
  if (!session) return { approvalSent: false, submits: 0 };
  const state = sessionStates.get(session) ?? { approvalSent: false, submits: 0 };
  sessionStates.set(session, state);
  return state;
};

export function OAuthStage({ stageData, submitAuthDict, onCancel }: StageComponentProps) {
  const { type, errorCode, error, session, info } = stageData;
  const url = (info as { url?: string } | undefined)?.url;
  const [oauthWindow, setOauthWindow] = useState<Window>();
  const stateRef = useRef(getSessionState(session));
  const [polling, setPolling] = useState(stateRef.current.approvalSent);
  const lastPollRef = useRef(0);
  const leftAppRef = useRef(stateRef.current.approvalSent);

  const handleSubmit = useCallback(() => {
    const state = stateRef.current;
    state.submits += 1;
    // The spec completes this stage with the session alone; continuwuity reads a
    // type-less dict as a fallback acknowledgement, so alternate both forms.
    submitAuthDict(state.submits % 2 === 1 ? { session } : { type, session });
  }, [submitAuthDict, type, session]);

  const handleCancel = () => {
    if (session) sessionStates.delete(session);
    onCancel();
  };

  const awaitApproval = () => {
    stateRef.current.approvalSent = true;
    setPolling(true);
  };

  const handleContinue = () => {
    if (!url) return;
    if (isTauri()) {
      import('@tauri-apps/plugin-opener')
        .then(({ openUrl }) => openUrl(url))
        .then(awaitApproval)
        .catch(() => {
          const w = window.open(url, '_blank');
          setOauthWindow(w ?? undefined);
          awaitApproval();
        });
      return;
    }
    const w = window.open(url, '_blank');
    setOauthWindow(w ?? undefined);
    awaitApproval();
  };

  const triggerPoll = useCallback(() => {
    if (!polling || !leftAppRef.current) return;
    const now = Date.now();
    if (now - lastPollRef.current < POLL_COOLDOWN_MS) return;
    lastPollRef.current = now;
    handleSubmit();
  }, [polling, handleSubmit]);

  useEffect(() => {
    const state = stateRef.current;
    if (state.approvalSent && state.submits === 1) handleSubmit();
  }, [handleSubmit]);

  useEffect(() => {
    if (!url) return undefined;
    const handleMessage = (evt: MessageEvent) => {
      if (
        evt.origin === new URL(url).origin &&
        oauthWindow &&
        evt.data === 'authDone' &&
        evt.source === oauthWindow
      ) {
        oauthWindow.close();
        setOauthWindow(undefined);
        setPolling(false);
        handleSubmit();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [oauthWindow, handleSubmit, url]);

  useEffect(() => {
    if (!polling) return undefined;
    const onBlur = () => {
      leftAppRef.current = true;
    };
    const onFocus = () => triggerPoll();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') triggerPoll();
      else leftAppRef.current = true;
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [polling, triggerPoll]);

  const showContinueButton = oauthWindow || polling;

  return (
    <Dialog>
      <Header
        style={{
          padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
        }}
        variant="Surface"
        size="500"
      >
        <Box grow="Yes">
          <Text size="H4">Account Authorization</Text>
        </Box>
        <IconButton size="300" onClick={handleCancel} radii="300">
          {composerIcon(X)}
        </IconButton>
      </Header>
      <Box
        style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}
        direction="Column"
        gap="400"
      >
        <Text size="T200">
          To perform this action you need to authorize it via the account management page in your
          browser.
        </Text>
        {errorCode && (
          <Box alignItems="Center" gap="100" style={{ color: color.Critical.Main }}>
            {sizedIcon(Warning, '50', { filled: true })}
            <Text size="T200">
              <b>{`${errorCode}: ${error}`}</b>
            </Text>
          </Box>
        )}
        {polling && (
          <Text size="T200">
            Complete the authorization in your browser, then return to the app. Your action will
            resume automatically.
          </Text>
        )}

        {showContinueButton ? (
          <Button variant="Primary" onClick={handleSubmit}>
            <Text as="span" size="B400">
              Continue
            </Text>
          </Button>
        ) : (
          <Button variant="Primary" onClick={handleContinue} disabled={!url}>
            <Text as="span" size="B400">
              Continue in Browser
            </Text>
          </Button>
        )}
      </Box>
    </Dialog>
  );
}
