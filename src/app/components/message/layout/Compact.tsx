import type { ReactNode } from 'react';
import { Box, as } from 'folds';
import * as css from './layout.css';

type CompactLayoutProps = {
  before?: ReactNode;
  avatar?: ReactNode;
};

export const CompactLayout = as<'div', CompactLayoutProps>(
  ({ before, avatar, children, ...props }, ref) => (
    <Box gap="200" {...props} ref={ref}>
      <Box className={css.CompactHeader} gap="200" shrink="No">
        {before}
        {avatar}
      </Box>
      {children}
    </Box>
  )
);
