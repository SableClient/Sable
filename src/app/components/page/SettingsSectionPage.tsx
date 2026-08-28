import type { ReactNode } from 'react';
import { Box, IconButton, Text } from 'folds';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { ArrowLeft, composerIcon, X } from '$components/icons/phosphor';
import { useAndroidBackHandler } from '$utils/androidBack';
import { Page, PageHeader } from './Page';
import { SettingsSectionBody, SettingsSectionHeader } from './style.css';

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
  useAndroidBackHandler(() => {
    requestBack?.();
    return true;
  }, !!showBack);

  return (
    <Page>
      <PageHeader className={SettingsSectionHeader}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            {showBack && (
              <IconButton aria-label={backLabel ?? 'Back'} onClick={requestBack} variant="Surface">
                {composerIcon(ArrowLeft)}
              </IconButton>
            )}
            <Text size="H4" as={titleAs} truncate>
              {title}
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton aria-label={closeLabel} onClick={requestClose} variant="Surface">
              {composerIcon(X)}
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes" className={SettingsSectionBody}>
        {children}
      </Box>
    </Page>
  );
}
