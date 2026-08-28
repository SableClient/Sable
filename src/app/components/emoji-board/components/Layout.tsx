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
    sheet?: boolean;
  }
>(({ className, header, sidebar, children, isFullWidth, sheet, ...props }, ref) => (
  <Box
    display="InlineFlex"
    className={classNames(css.Base({ isFullWidth, sheet }), className)}
    direction="Row"
    {...props}
    ref={ref}
  >
    <Box direction="Column" grow="Yes" className={css.Main}>
      <Box
        className={classNames(css.Header, sheet && css.SheetHeader)}
        direction="Column"
        shrink="No"
      >
        {header}
      </Box>
      <Box className={css.Body}>{children}</Box>
    </Box>
    {sidebar && <Line size="300" direction="Vertical" />}
    {sidebar}
  </Box>
));
