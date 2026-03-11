import { ReactNode } from 'react';
import { Box } from 'folds';
import { NotificationBanner } from '$components/notification-banner';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  return (
    <Box grow="Yes">
      <NotificationBanner />
      <Box shrink="No">{nav}</Box>
      <Box grow="Yes">{children}</Box>
    </Box>
  );
}
