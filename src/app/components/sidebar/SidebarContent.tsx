import { ReactNode } from 'react';
import { Box } from 'folds';

type SidebarContentProps = {
  topSticky?: ReactNode;
  scrollable: ReactNode;
  bottomSticky?: ReactNode;
};
export function SidebarContent({ topSticky, scrollable, bottomSticky }: SidebarContentProps) {
  return (
    <>
      {topSticky && <Box direction="Column" shrink="No">{topSticky}</Box>}
      <Box direction="Column" grow="Yes" style={{ minHeight: 0 }}>
        {scrollable}
      </Box>
      {bottomSticky && <Box direction="Column" shrink="No">{bottomSticky}</Box>}
    </>
  );
}
