import { as, Box, Line } from 'folds';
import { ReactNode } from 'react';
import classNames from 'classnames';
import * as css from './styles.css';

export const EmojiBoardLayout = as<
  'div',
  {
    header: ReactNode;
    sidebar?: ReactNode;
    children: ReactNode;
  }
>(({ className, header, sidebar, children, ...props }, ref) => (
  <Box
    display="InlineFlex"
    className={classNames(css.Base, className)}
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
