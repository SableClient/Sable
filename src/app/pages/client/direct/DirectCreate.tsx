import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Box, IconButton, Scroll } from 'folds';
import { ArrowLeft, At, composerIcon, dropzoneIcon } from '$components/icons/phosphor';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { getDirectCreateSearchParams } from '$pages/pathSearchParam';
import { getDMRoomFor } from '$utils/matrix';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroSection,
} from '$components/page';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { CreateChat } from '$features/create-chat';

export function DirectCreate() {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();

  const { navigateRoom } = useRoomNavigate();
  const [searchParams] = useSearchParams();
  const { userId } = getDirectCreateSearchParams(searchParams);

  useEffect(() => {
    if (!userId) return;
    const roomId = getDMRoomFor(mx, userId)?.roomId;
    if (roomId) {
      navigateRoom(roomId, undefined, { replace: true });
    }
  }, [mx, navigateRoom, userId]);

  return (
    <Page>
      {screenSize === ScreenSize.Mobile && (
        <PageHeader balance outlined={false}>
          <Box grow="Yes" alignItems="Center" gap="200">
            <BackRouteHandler>
              {(onBack) => <IconButton onClick={onBack}>{composerIcon(ArrowLeft)}</IconButton>}
            </BackRouteHandler>
          </Box>
        </PageHeader>
      )}
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <PageHeroSection>
                <Box direction="Column" gap="700">
                  <PageHero
                    icon={dropzoneIcon(At)}
                    title="Create Chat"
                    subTitle="Start a private, encrypted chat by entering a user ID."
                  />
                  <CreateChat defaultUserId={userId} />
                </Box>
              </PageHeroSection>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
