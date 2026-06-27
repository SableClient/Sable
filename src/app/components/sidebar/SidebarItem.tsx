import classNames from 'classnames';
import type { Position } from 'folds';
import { as, Avatar, Text, Tooltip, TooltipProvider, toRem } from 'folds';
import type { ComponentProps, ReactNode, RefCallback } from 'react';
import * as css from './Sidebar.css';

export const SidebarItemBottom = as<'div', css.SidebarItemVariants>(
  ({ as: AsSidebarAvatarBox = 'div', className, active, ...props }, ref) => (
    <AsSidebarAvatarBox
      className={classNames(css.SidebarItemBottom({ active }), className)}
      {...props}
      ref={ref}
    />
  )
);

export const SidebarItemLeft = as<'div', css.SidebarItemVariants>(
  ({ as: AsSidebarAvatarBox = 'div', className, active, ...props }, ref) => (
    <AsSidebarAvatarBox
      className={classNames(css.SidebarItem({ active }), className)}
      {...props}
      ref={ref}
    />
  )
);

export const SidebarItem = ({
  className,
  active,
  isBottom,
  children,
  ...props
}: {
  className?: string;
  active?: boolean;
  isBottom?: boolean;
  children: ReactNode;
}) => {
  if (isBottom)
    return (
      <SidebarItemBottom className={className} active={active} {...props}>
        {children}
      </SidebarItemBottom>
    );
  else
    return (
      <SidebarItemLeft className={className} active={active} {...props}>
        {children}
      </SidebarItemLeft>
    );
};

export const SidebarItemBadge = as<'div', css.SidebarItemBadgeVariants>(
  ({ as: AsSidebarBadgeBox = 'div', className, mode, ...props }, ref) => (
    <AsSidebarBadgeBox
      className={classNames(css.SidebarItemBadge({ mode }), className)}
      {...props}
      ref={ref}
    />
  )
);

export function SidebarItemTooltip({
  tooltip,
  children,
  position,
}: {
  tooltip?: ReactNode | string;
  children: (triggerRef: RefCallback<HTMLElement | SVGElement>) => ReactNode;
  position?: Position;
}) {
  if (!tooltip) {
    return children(() => undefined);
  }

  return (
    <TooltipProvider
      delay={400}
      position={position ?? 'Right'}
      tooltip={
        <Tooltip style={{ maxWidth: toRem(280) }}>
          <Text size="H5">{tooltip}</Text>
        </Tooltip>
      }
    >
      {children}
    </TooltipProvider>
  );
}

export const SidebarAvatar = as<'div', css.SidebarAvatarVariants & ComponentProps<typeof Avatar>>(
  ({ className, size, outlined, radii, ...props }, ref) => (
    <Avatar
      className={classNames(css.SidebarAvatar({ size, outlined }), className)}
      radii={radii}
      {...props}
      ref={ref}
    />
  )
);

export const SidebarFolder = as<'div', css.SidebarFolderVariants>(
  ({ as: AsSidebarFolder = 'div', className, state, ...props }, ref) => (
    <AsSidebarFolder
      className={classNames(css.SidebarFolder({ state }), className)}
      {...props}
      ref={ref}
    />
  )
);

export const SidebarFolderDropTarget = as<'div', css.SidebarFolderDropTargetVariants>(
  ({ as: AsSidebarFolderDropTarget = 'div', className, position, ...props }, ref) => (
    <AsSidebarFolderDropTarget
      className={classNames(css.SidebarFolderDropTarget({ position }), className)}
      {...props}
      ref={ref}
    />
  )
);
