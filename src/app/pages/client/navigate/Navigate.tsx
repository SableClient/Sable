import { Box, Scroll, toRem, Text, color, config } from 'folds';
import { SquaresFour, sizedIcon } from '$components/icons/phosphor';
import { Page, PageContent, PageContentCenter, PageNav, PageNavHeader } from '$components/page';
import { useEffect, useState } from 'react';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SidebarResizer } from '../sidebar/SidebarResizer';
import { useSetAtom } from 'jotai';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import { RoomSearchModal } from '$features/navigate';
import { UserQuickTools } from '../sidebar/UserQuickTools';

export function Navigate() {
  const setIsResizingSidebar = useSetAtom(isResizingSidebarAtom);
  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [curWidth, setCurWidth] = useState(roomSidebarWidth);
  const [oldSidebar] = useSetting(settingsAtom, 'oldSidebar');

  useEffect(() => {
    setCurWidth(roomSidebarWidth);
  }, [roomSidebarWidth]);
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const hideText = curWidth <= 80 && !isMobile;

  return (
    <>
      {!isMobile && (
        <Box
          shrink="No"
          style={{
            position: 'relative',
            width: toRem(curWidth),
            borderRight: 'solid',
            borderColor: color.Background.ContainerLine,
            borderWidth: `0 ${config.borderWidth.B300} 0 0`,
            background: color.Background.Container,
          }}
        >
          <PageNav>
            <PageNavHeader size="600">
              <Box grow="Yes" gap="300" justifyContent="Center">
                {!hideText ? (
                  <Box grow="Yes">
                    <Text size="H4" truncate>
                      Inbox
                    </Text>
                  </Box>
                ) : (
                  sizedIcon(SquaresFour, '200', { filled: true })
                )}
              </Box>
            </PageNavHeader>

            <SidebarResizer
              setCurWidth={setCurWidth}
              sidebarWidth={roomSidebarWidth}
              setSidebarWidth={setRoomSidebarWidth}
              instep={50}
              outstep={190}
              minValue={50}
              maxValue={500}
              setAnnouncement={setIsResizingSidebar}
            />
          </PageNav>
          {!oldSidebar && !isMobile && <UserQuickTools width={curWidth + 66} compact={false} />}
        </Box>
      )}
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
