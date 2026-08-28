import { Box, IconButton, Text } from 'folds';
import { ArrowLeft, composerIcon, dropzoneIcon, MagnifyingGlass } from '$components/icons/phosphor';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { PageHeader } from './Page';

export function MessageSearchHeader() {
  const screenSize = useScreenSizeContext();

  return (
    <PageHeader balance>
      <Box grow="Yes" alignItems="Center" gap="200">
        <Box grow="Yes" basis="No">
          {screenSize === ScreenSize.Mobile && (
            <BackRouteHandler>
              {(onBack) => <IconButton onClick={onBack}>{composerIcon(ArrowLeft)}</IconButton>}
            </BackRouteHandler>
          )}
        </Box>
        <Box justifyContent="Center" alignItems="Center" gap="200">
          {screenSize !== ScreenSize.Mobile && dropzoneIcon(MagnifyingGlass)}
          <Text size="H3" truncate>
            Message Search
          </Text>
        </Box>
        <Box grow="Yes" basis="No" />
      </Box>
    </PageHeader>
  );
}
