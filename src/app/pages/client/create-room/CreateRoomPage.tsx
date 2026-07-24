import { Box, IconButton, Scroll, toRem, Text, color, config } from 'folds';
import { SquaresFour, composerIcon, sizedIcon, X } from '$components/icons/phosphor';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHero,
  PageHeroSection,
  PageNav,
  PageNavHeader,
} from '$components/page';
import { CreateRoomForm } from '$features/create-room/CreateRoom';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { SpaceProvider } from '$hooks/useSpace';
import { useAllJoinedRoomsSet, useGetRoom } from '$hooks/useGetRoom';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SidebarResizer } from '../sidebar/SidebarResizer';
import { useSetAtom } from 'jotai';
import { isResizingSidebarAtom } from '$state/isResizingSidebar';
import { UserQuickTools } from '../sidebar/UserQuickTools';
import { CreateRoomType } from '$components/create-room/types';

export function CreateRoomPage() {
  const { navigateRoom } = useRoomNavigate();
  const backNavigate = useNavigate();

  const [searchParams] = useSearchParams();
  const spaceIdParam = searchParams.get('spaceId') ?? undefined;
  const typeParam = searchParams.get('type') ?? undefined;

  // Parse type only for valid CreateRoomType enum values
  const type: CreateRoomType | undefined =
    typeParam === CreateRoomType.TextRoom || typeParam === CreateRoomType.VoiceRoom
      ? (typeParam as CreateRoomType)
      : undefined;

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceIdParam ? getRoom(spaceIdParam) : undefined;

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

  const title = type === CreateRoomType.VoiceRoom ? 'New Voice Room' : 'New Chat Room';

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
                      {title}
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
        <Box grow="Yes" direction="Column">
          {isMobile && (
            <PageNav>
              <PageNavHeader size="600">
                <Box grow="Yes" gap="300" alignItems="Center">
                  <Box grow="Yes" style={{ flexBasis: 0 }} />
                  <Text size="H4" align="Center" truncate>
                    {title}
                  </Text>
                  <Box grow="Yes" style={{ flexBasis: 0 }} justifyContent="End">
                    <IconButton
                      aria-label="Close create room"
                      onClick={() => backNavigate(-1)}
                      variant="Background"
                    >
                      {composerIcon(X)}
                    </IconButton>
                  </Box>
                </Box>
              </PageNavHeader>
            </PageNav>
          )}
          <Scroll hideTrack visibility="Hover">
            <PageContent>
              <PageContentCenter>
                <PageHeroSection>
                  <Box direction="Column" gap="700">
                    <PageHero
                      icon={sizedIcon(SquaresFour, '600')}
                      title={title}
                      subTitle="Create a new room."
                    />
                    <SpaceProvider value={space ?? null}>
                      <CreateRoomForm space={space} onCreate={navigateRoom} defaultType={type} />
                    </SpaceProvider>
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
