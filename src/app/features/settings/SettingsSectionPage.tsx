import { ReactNode } from 'react';
import { Box, Icon, IconButton, Icons, Text } from 'folds';
import { Page, PageHeader } from '$components/page';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';

type SettingsSectionPageProps = {
  title: ReactNode;
  requestClose: () => void;
  titleAs?: 'h1' | 'h2' | 'h3' | 'span' | 'div';
  actionLabel?: string;
  children?: ReactNode;
};

export function SettingsSectionPage({
  title,
  requestClose,
  titleAs,
  actionLabel,
  children,
}: SettingsSectionPageProps) {
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const closeLabel = isMobile ? 'Back' : (actionLabel ?? 'Close');

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" as={titleAs} truncate>
              {title}
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton aria-label={closeLabel} onClick={requestClose} variant="Surface">
              <Icon src={isMobile ? Icons.ArrowLeft : Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">{children}</Box>
    </Page>
  );
}
