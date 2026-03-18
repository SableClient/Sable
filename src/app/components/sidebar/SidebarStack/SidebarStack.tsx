import classNames from 'classnames';
import { as, color, config } from 'folds';
import { BackgroundGlow } from '$components/BackgroundGlow';
import * as css from './SidebarStack.css';

export const SidebarStack = as<'div', css.SidebarStackVariants>(
  ({ as: AsSidebarStack = 'div', children, className, shield, fill, ...props }, ref) => (
    <AsSidebarStack
      className={classNames(css.SidebarStack({ shield, fill }), className)}
      {...props}
      ref={ref}
    >
      {shield && (
        <BackgroundGlow
          color={color.Background.Container}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: `calc(${config.radii.R400} + 0.25rem)`,
          }}
        />
      )}
      {children}
    </AsSidebarStack>
  )
);
