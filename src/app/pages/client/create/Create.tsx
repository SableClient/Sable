import { Box, Scroll } from 'folds';
import { FoldersIcon } from '@phosphor-icons/react/dist/csr/Folders';
import { Page, PageContent, PageContentCenter, PageHero, PageHeroSection } from '$components/page';
import { CreateSpaceForm } from '$features/create-space';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { PhosphorIcon } from '$components/PhosphorIcon';

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
                    icon={<PhosphorIcon as={FoldersIcon} size="600" weight="fill" />}
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
