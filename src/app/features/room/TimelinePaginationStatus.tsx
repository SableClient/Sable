import { Box, Chip, Spinner, Text, color, config } from 'folds';

export type TimelinePaginationStatus = 'idle' | 'loading' | 'error';

export type TimelinePaginationStatusRowProps = {
  direction: 'backward' | 'forward';
  eventsLength: number;
  hasMore: boolean;
  status: TimelinePaginationStatus;
  onRetry: () => void;
};

export function TimelinePaginationStatusRow({
  direction,
  eventsLength,
  hasMore,
  status,
  onRetry,
}: Readonly<TimelinePaginationStatusRowProps>) {
  if (!hasMore && status === 'idle') return null;

  if (status === 'error') {
    return (
      <Box
        justifyContent="Center"
        alignItems="Center"
        gap="200"
        style={{ padding: config.space.S300 }}
      >
        <Text style={{ color: color.Critical.Main }} size="T300">
          {direction === 'backward' ? 'Failed to load history.' : 'Failed to load messages.'}
        </Text>
        <Chip variant="SurfaceVariant" radii="Pill" outlined onClick={onRetry}>
          <Text size="B300">Retry</Text>
        </Chip>
      </Box>
    );
  }

  if (status === 'loading' && eventsLength > 0) {
    return (
      <Box justifyContent="Center" style={{ padding: config.space.S300 }}>
        <Spinner variant="Secondary" size="400" />
      </Box>
    );
  }

  return null;
}
