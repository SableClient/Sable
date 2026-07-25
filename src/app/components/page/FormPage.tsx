import type { ReactNode } from 'react';
import { Box, IconButton, Scroll, Text, color } from 'folds';
import { SquaresFour, composerIcon, sizedIcon, X } from '$components/icons/phosphor';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHero,
  PageHeroSection,
  PageNav,
  PageNavHeader,
} from './Page';
import { SidebarPanel } from './SidebarPanel';

type FormPageProps = {
  title: string;
  subTitle: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

export function FormPage({ title, subTitle, closeLabel, onClose, children }: FormPageProps) {
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;

  return (
    <>
      {!isMobile && <SidebarPanel title={title} />}
      <Page>
        <Box grow="Yes" direction="Column" style={{ background: color.Background.Container }}>
          {isMobile && (
            <PageNav>
              <PageNavHeader size="600">
                <Box grow="Yes" gap="300" alignItems="Center">
                  <Box grow="Yes" basis="No" />
                  <Text size="H4" align="Center" truncate>
                    {title}
                  </Text>
                  <Box grow="Yes" basis="No" shrink="No" justifyContent="End">
                    <IconButton size="300" radii="300" aria-label={closeLabel} onClick={onClose}>
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
                      subTitle={subTitle}
                    />
                    {children}
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
