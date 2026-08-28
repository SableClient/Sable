import { Box, Scroll, Text, color } from 'folds';
import { Page, PageContent, PageContentCenter, PageNavHeader } from '$components/page';
import { SidebarPanel } from '$components/page/SidebarPanel';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useLocation } from 'react-router';
import { RoomSearchModal, SearchWrapper } from '$features/navigate';
import { getBackgroundLocation } from '../shallowRoute';
import { useCloseShallowRoute } from '../useShallowRoute';

export function Navigate() {
  const location = useLocation();
  const overlayScreenSize = useScreenSizeContext();
  const requestClose = useCloseShallowRoute();

  if (overlayScreenSize !== ScreenSize.Mobile && getBackgroundLocation(location.state)) {
    return <SearchWrapper requestClose={requestClose} />;
  }

  return <NavigatePage />;
}

function NavigatePage() {
  const isMobile = useScreenSizeContext() === ScreenSize.Mobile;

  return (
    <>
      {!isMobile && <SidebarPanel title="Navigate" />}
      <Page>
        <Box grow="Yes" direction="Column" style={{ background: color.Background.Container }}>
          <PageNavHeader size="600">
            <Box grow="Yes" gap="300" justifyContent="Center">
              <Box grow="Yes">
                <Text size="H4" align="Center" truncate style={{ width: '100%' }}>
                  Navigate
                </Text>
              </Box>
            </Box>
          </PageNavHeader>
          <Scroll hideTrack visibility="Hover">
            <PageContent style={{ height: '100%', paddingBottom: '0' }}>
              <PageContentCenter style={{ height: '100%' }}>
                <Box direction="Column" gap="100" alignItems="Center" style={{ height: '100%' }}>
                  <RoomSearchModal isMobile />
                </Box>
              </PageContentCenter>
            </PageContent>
          </Scroll>
        </Box>
      </Page>
    </>
  );
}
