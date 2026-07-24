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
import { BugReportForm } from '$features/bug-report';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SidebarResizer } from '../sidebar/SidebarResizer';
import { useSetAtom } from 'jotai';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import { UserQuickTools } from '../sidebar/UserQuickTools';

export function BugReportPage() {
  const navigate = useNavigate();
  const navigateBack = () => navigate(-1);

  const setIsResizingSidebar = useSetAtom(isResizingSidebarAtom);
  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [curWidth, setCurWidth] = useState(roomSidebarWidth);

  useEffect(() => {
    setCurWidth(roomSidebarWidth);
  }, [roomSidebarWidth]);
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const hideText = curWidth <= 80 && !isMobile;
  const [oldSidebar] = useSetting(settingsAtom, 'oldSidebar');

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
                      Report an Issue
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
          <Scroll hideTrack visibility="Hover">
            <PageContent>
              <PageContentCenter>
                <PageHeroSection>
                  <Box direction="Column" gap="700">
                    <PageHero
                      icon={sizedIcon(SquaresFour, '600')}
                      title="Report an Issue"
                      subTitle="Report a bug or request a feature."
                    />
                    <BugReportForm onDone={navigateBack} />
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
