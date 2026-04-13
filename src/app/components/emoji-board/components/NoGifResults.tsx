import { Box, toRem, config, Icons, Icon, Text } from 'folds';

export function GifSearching() {
  return (
    <Box
      style={{ padding: `${toRem(60)} ${config.space.S500}` }}
      alignItems="Center"
      justifyContent="Center"
      direction="Column"
      gap="300"
    >
      <Text>Loading GIFs...</Text>
    </Box>
  );
}

export function GifSearchError({ error }: { error: string }) {
  return (
    <Box
      style={{ padding: `${toRem(60)} ${config.space.S500}` }}
      alignItems="Center"
      justifyContent="Center"
      direction="Column"
      gap="300"
    >
      <Text>Error: {error}</Text>
    </Box>
  );
}

export function NoGifResults() {
  return (
    <Box
      style={{ padding: `${toRem(60)} ${config.space.S500}` }}
      alignItems="Center"
      justifyContent="Center"
      direction="Column"
      gap="300"
    >
      <Icon size="600" src={Icons.Play} />
      <Box direction="Inherit">
        <Text align="Center">No GIFs found!</Text>
        <Text priority="300" align="Center" size="T200">
          Try searching for something else.
        </Text>
      </Box>
    </Box>
  );
}

type GifStatusProps = {
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
};

export function GifStatus({ loading, error, isEmpty }: Readonly<GifStatusProps>) {
  if (loading) return <GifSearching />;
  if (error) return <GifSearchError error={error} />;
  if (isEmpty) return <NoGifResults />;
  return null;
}
