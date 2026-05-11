import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import { useCallback, useState } from 'react';
import { Box, config, Line, Text } from 'folds';
import * as Sentry from '@sentry/react';
import { useSyncState } from '$hooks/useSyncState';
import { ContainerColor } from '$styles/ContainerColor.css';

type StateData = {
  current: SyncState | null;
  previous: SyncState | null | undefined;
};

type SyncStatusProps = {
  mx: MatrixClient;
};
export function SyncStatus({ mx }: SyncStatusProps) {
  const [stateData, setStateData] = useState<StateData>({
    current: null,
    previous: undefined,
  });

  useSyncState(
    mx,
    useCallback((current, previous) => {
      setStateData((s) => {
        if (s.current === current && s.previous === previous) {
          return s;
        }
        return { current, previous };
      });

      if (current === SyncState.Reconnecting || current === SyncState.Error) {
        Sentry.addBreadcrumb({
          category: 'sync',
          message: `Sync state changed to ${current}`,
          level: current === SyncState.Error ? 'error' : 'warning',
          data: { previous },
        });
        Sentry.metrics.count('sable.sync.degraded', 1, {
          attributes: { state: current },
        });
      }
    }, [])
  );

  if (
    (stateData.current === SyncState.Prepared ||
      stateData.current === SyncState.Syncing ||
      stateData.current === SyncState.Catchup) &&
    stateData.previous !== SyncState.Syncing
  ) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Success' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connecting...</Text>
        </Box>
        <Line variant="Success" size="300" />
      </Box>
    );
  }

  if (stateData.current === SyncState.Reconnecting) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connection Lost! Reconnecting...</Text>
        </Box>
        <Line variant="Warning" size="300" />
      </Box>
    );
  }

  if (stateData.current === SyncState.Error) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connection Lost!</Text>
        </Box>
        <Line variant="Critical" size="300" />
      </Box>
    );
  }

  return null;
}
