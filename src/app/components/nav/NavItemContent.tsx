import type { ComponentProps } from 'react';
import { as } from 'folds';
import classNames from 'classnames';
import * as css from './styles.css';

export const NavItemContent = as<'div', ComponentProps<'div'>>(
  ({ children, className, ...props }, ref) => (
    <div
      // Keep nav row spacing on a plain element so the shared folds reset cannot
      // zero out padding or text metrics later through CSS chunk order.
      className={classNames(css.NavItemContent, className)}
      {...props}
      ref={ref}
    >
      {children}
    </div>
  )
);
