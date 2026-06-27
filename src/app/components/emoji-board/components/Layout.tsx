import { as, Box, Line } from 'folds';
import type { ReactNode } from 'react';
import classNames from 'classnames';
import * as css from './styles.css';

export const EmojiBoardLayout = as<
  'div',
  {
    header: ReactNode;
    sidebar?: ReactNode;
    children: ReactNode;
    isFullWidth?: boolean;
  }
>(({ className, header, sidebar, children, isFullWidth, ...props }, ref) => (
  <Box
    display="InlineFlex"
    className={classNames(css.Base({ isFullWidth }), className)}
    direction="Row"
    {...props}
    ref={ref}
  >
    <Box direction="Column" grow="Yes">
      <Box className={css.Header} direction="Column" shrink="No">
        {header}
      </Box>
      {children}
    </Box>
    <Line size="300" direction="Vertical" />
    {sidebar}
  </Box>
));
