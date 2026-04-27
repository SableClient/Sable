import type { ReactNode } from 'react';
import { Box, Icon, IconButton, Icons, Text } from 'folds';
import { Page, PageHeader } from '$components/page';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { settingsHeader } from './styles.css';

type SettingsSectionPageProps = {
  title: ReactNode;
  requestBack?: () => void;
  requestClose: () => void;
  titleAs?: 'h1' | 'h2' | 'h3' | 'span' | 'div';
  backLabel?: string;
  actionLabel?: string;
  children?: ReactNode;
};

export function SettingsSectionPage({
  title,
  requestBack,
  requestClose,
  titleAs,
  backLabel,
  actionLabel,
  children,
}: SettingsSectionPageProps) {
  const screenSize = useScreenSizeContext();
  const closeLabel = actionLabel ?? 'Close';
  const showBack = screenSize === ScreenSize.Mobile && requestBack;

  return (
    <Page>
      <PageHeader className={settingsHeader}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            {showBack && (
              <IconButton aria-label={backLabel ?? 'Back'} onClick={requestBack} variant="Surface">
                <Icon src={Icons.ArrowLeft} />
              </IconButton>
            )}
            <Text size="H4" as={titleAs} truncate>
              {title}
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton aria-label={closeLabel} onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">{children}</Box>
    </Page>
  );
}
