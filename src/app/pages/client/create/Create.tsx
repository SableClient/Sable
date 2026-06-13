import { Box, Scroll } from 'folds';
import { SquaresFour, iconAt } from '$components/icons/phosphor';
import { Page, PageContent, PageContentCenter, PageHero, PageHeroSection } from '$components/page';
import { CreateSpaceForm } from '$features/create-space';
import { useRoomNavigate } from '$hooks/useRoomNavigate';

export function Create() {
  const { navigateSpace } = useRoomNavigate();

  return (
    <Page>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <PageHeroSection>
                <Box direction="Column" gap="700">
                  <PageHero
                    icon={iconAt(SquaresFour, '600')}
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
  );
}
