import { Box, Scroll, IconButton } from 'folds';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { HashIcon } from '@phosphor-icons/react/dist/csr/Hash';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHero,
  PageHeroSection,
} from '$components/page';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { CreateRoomForm } from '$features/create-room';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { PhosphorIcon } from '$components/PhosphorIcon';

export function HomeCreateRoom() {
  const screenSize = useScreenSizeContext();

  const { navigateRoom } = useRoomNavigate();

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
                    icon={<PhosphorIcon as={HashIcon} size="600" />}
                    title="Create Room"
                    subTitle="Build a Room for Real-Time Conversations."
                  />
                  <CreateRoomForm onCreate={navigateRoom} />
                </Box>
              </PageHeroSection>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
