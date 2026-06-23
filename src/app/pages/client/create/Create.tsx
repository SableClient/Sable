import { Box, Scroll, toRem, Text, color, config } from 'folds';
import { SquaresFour, sizedIcon } from '$components/icons/phosphor';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHero,
  PageHeroSection,
  PageNav,
  PageNavHeader,
} from '$components/page';
import { CreateSpaceForm } from '$features/create-space';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useEffect, useState } from 'react';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SidebarResizer } from '../sidebar/SidebarResizer';
import { useSetAtom } from 'jotai';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';

export function Create() {
  const { navigateSpace } = useRoomNavigate();

  const setIsResizingSidebar = useSetAtom(isResizingSidebarAtom);
  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [curWidth, setCurWidth] = useState(roomSidebarWidth);

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
            borderColor: color.SurfaceVariant.ContainerLine,
            borderWidth: `0 ${config.borderWidth.B300} 0 0`,
          }}
        >
          <PageNav>
            <PageNavHeader size="600">
              <Box grow="Yes" gap="300" justifyContent="Center">
                {!hideText ? (
                  <Box grow="Yes">
                    <Text size="H4" truncate align="Center">
                      Create Space
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
              instep={80}
              outstep={190}
              minValue={50}
              maxValue={500}
              setAnnouncement={setIsResizingSidebar}
            />
          </PageNav>
        </Box>
      )}
      <Page>
        <Box grow="Yes">
          <Scroll hideTrack visibility="Hover">
            <PageContent>
              <PageContentCenter>
                <PageHeroSection>
                  <Box direction="Column" gap="700">
                    <PageHero
                      icon={sizedIcon(SquaresFour, '600')}
                      title="Create Space"
                      subTitle="Build a space for your community."
                    />
                    <CreateSpaceForm onCreate={navigateSpace} />
                  </Box>
                </PageHeroSection>
              </PageContentCenter>
            </PageContent>
          </Scroll>
        </Box>
      </Page>
    </>
  );
}
