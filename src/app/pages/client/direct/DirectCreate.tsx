import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, IconButton, Scroll } from 'folds';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { AtIcon } from '@phosphor-icons/react/dist/csr/At';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getDirectCreateSearchParams } from '$pages/pathSearchParam';
import { getDirectRoomPath } from '$pages/pathUtils';
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
import { PhosphorIcon } from '$components/PhosphorIcon';
import { useDirectRooms } from './useDirectRooms';

export function DirectCreate() {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userId } = getDirectCreateSearchParams(searchParams);

  const directs = useDirectRooms();

  useEffect(() => {
    if (userId) {
      const roomId = getDMRoomFor(mx, userId)?.roomId;
      if (roomId && directs.includes(roomId)) {
        navigate(getDirectRoomPath(roomId), { replace: true });
      }
    }
  }, [mx, navigate, directs, userId]);

  return (
    <Page>
      {screenSize === ScreenSize.Mobile && (
        <PageHeader balance outlined={false}>
          <Box grow="Yes" alignItems="Center" gap="200">
            <BackRouteHandler>
              {(onBack) => (
                <IconButton onClick={onBack}>
                  <PhosphorIcon as={ArrowLeftIcon} />
                </IconButton>
              )}
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
                    icon={<PhosphorIcon as={AtIcon} size="600" />}
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
