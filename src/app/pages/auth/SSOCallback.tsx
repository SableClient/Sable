import { useEffect, useState } from 'react';
import { Box, Spinner, Text, color } from 'folds';
import { AuthShell } from './AuthShell';

type SSOCallbackState = 'redirecting' | 'waiting' | 'done' | 'error';

export function SSOCallback() {
  const [state, setState] = useState<SSOCallbackState>('waiting');

  useEffect(() => {
    const { search } = window.location;
    const params = new URLSearchParams(search);

    if (!params.has('loginToken')) {
      setState('error');
      return undefined;
    }

    window.location.href = `sable://login${search}`;

    const loadedAt = Date.now();
    const handleHide = () => {
      if (Date.now() - loadedAt < 500) return;
      setState('done');
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleHide();
    };
    window.addEventListener('blur', handleHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <AuthShell>
      <Box direction="Column" gap="500">
        <Text size="H2" priority="400">
          Logging In
        </Text>

        {state === 'redirecting' && (
          <Box direction="Column" gap="300">
            <Box gap="200" alignItems="Center">
              <Spinner size="100" variant="Secondary" />
              <Text size="T300" style={{ color: color.Secondary.Main }}>
                Opening Sable...
              </Text>
            </Box>
          </Box>
        )}

        {state === 'waiting' && (
          <Box direction="Column" gap="300">
            <Box gap="200" alignItems="Center">
              <Spinner size="100" variant="Secondary" />
              <Text size="T300" style={{ color: color.Secondary.Main }}>
                Waiting for you to approve the popup...
              </Text>
            </Box>
            <Text size="T300" priority="300">
              Your browser should be showing a confirmation dialog asking to open Sable. Click{' '}
              <strong>Open</strong> or <strong>Allow</strong> to continue logging in.
            </Text>
            <Text size="T300" priority="300">
              If nothing appeared,{' '}
              <a
                href={`sable://login${window.location.search}`}
                style={{ color: color.Primary.Main }}
              >
                click here to try again
              </a>
              .
            </Text>
          </Box>
        )}

        {state === 'done' && (
          <Box direction="Column" gap="300">
            <Text size="T300" style={{ color: color.Success?.Main }}>
              ✓ Sable opened successfully.
            </Text>
            <Text size="T300" priority="300">
              You are now logged in. You can close this tab.
            </Text>
          </Box>
        )}

        {state === 'error' && (
          <Box direction="Column" gap="300">
            <Text size="T300" style={{ color: color.Critical.Main }}>
              Something went wrong — no login token was found in the URL.
            </Text>
            <Text size="T300" priority="300">
              Please return to Sable and try logging in again.
            </Text>
          </Box>
        )}
      </Box>
    </AuthShell>
  );
}
