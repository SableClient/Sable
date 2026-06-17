import type { ReactNode } from 'react';
import { Box, as } from 'folds';
import * as css from './layout.css';

type ModernLayoutProps = {
  before?: ReactNode;
};

export const ModernLayout = as<'div', ModernLayoutProps>(({ before, children, ...props }, ref) => (
  <Box className={css.ModernRow} {...props} ref={ref}>
    <Box className={css.ModernBefore} shrink="No">
      {before}
    </Box>
    <Box className={css.ModernContent} grow="Yes" direction="Column">
      {children}
    </Box>
  </Box>
));
