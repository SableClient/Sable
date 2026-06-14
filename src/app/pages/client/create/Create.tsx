import { Box, Scroll } from 'folds';
import { Page, PageContent, PageContentCenter, PageHero, PageHeroSection } from '$components/page';
import { CreateSpaceForm } from '$features/create-space';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { Icon, Icons } from '$app/icons';

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
                    icon={<Icon size="600" src={Icons.Space} />}
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
