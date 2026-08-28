import { Box, Button, color, config, Dialog, Header, IconButton, Text } from 'folds';
import { Warning, composerIcon, sizedIcon, X } from '$components/icons/phosphor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { StageComponentProps } from './types';

const POLL_COOLDOWN_MS = 1500;

export function SSOStage({
  ssoRedirectURL,
  stageData,
  submitAuthDict,
  onCancel,
}: StageComponentProps & {
  ssoRedirectURL: string;
}) {
  const { errorCode, error, session } = stageData;
  const [ssoWindow, setSSOWindow] = useState<Window>();
  const [polling, setPolling] = useState(false);
  const lastPollRef = useRef(0);

  const handleSubmit = useCallback(() => {
    submitAuthDict({
      session,
    });
  }, [submitAuthDict, session]);

  const handleContinue = () => {
    if (isTauri()) {
      import('@tauri-apps/plugin-opener')
        .then(({ openUrl }) => openUrl(ssoRedirectURL))
        .then(() => setPolling(true))
        .catch(() => {
          const w = window.open(ssoRedirectURL, '_blank');
          setSSOWindow(w ?? undefined);
        });
      return;
    }
    const w = window.open(ssoRedirectURL, '_blank');
    setSSOWindow(w ?? undefined);
  };

  const triggerPoll = useCallback(() => {
    if (!polling) return;
    const now = Date.now();
    if (now - lastPollRef.current < POLL_COOLDOWN_MS) return;
    lastPollRef.current = now;
    handleSubmit();
  }, [polling, handleSubmit]);

  useEffect(() => {
    const handleMessage = (evt: MessageEvent) => {
      if (
        evt.origin === new URL(ssoRedirectURL).origin &&
        ssoWindow &&
        evt.data === 'authDone' &&
        evt.source === ssoWindow
      ) {
        ssoWindow.close();
        setSSOWindow(undefined);
        setPolling(false);
        handleSubmit();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [ssoWindow, handleSubmit, ssoRedirectURL]);

  useEffect(() => {
    if (!polling) return undefined;
    const onFocus = () => triggerPoll();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') triggerPoll();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [polling, triggerPoll]);

  const showContinueButton = ssoWindow || polling;

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
          <Text size="H4">SSO Login</Text>
        </Box>
        <IconButton size="300" onClick={onCancel} radii="300">
          {composerIcon(X)}
        </IconButton>
      </Header>
      <Box
        style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}
        direction="Column"
        gap="400"
      >
        <Text size="T200">
          To perform this action you need to authenticate yourself by SSO login.
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
            Complete SSO in your browser, then return to the app. Your action will resume
            automatically.
          </Text>
        )}

        {showContinueButton ? (
          <Button variant="Primary" onClick={handleSubmit}>
            <Text as="span" size="B400">
              Continue
            </Text>
          </Button>
        ) : (
          <Button variant="Primary" onClick={handleContinue}>
            <Text as="span" size="B400">
              Continue with SSO
            </Text>
          </Button>
        )}
      </Box>
    </Dialog>
  );
}
