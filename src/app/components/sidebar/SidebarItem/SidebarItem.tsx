import classNames from 'classnames';
import { as, Avatar, Text, Tooltip, TooltipProvider, toRem } from 'folds';
import { ComponentProps, ReactNode, RefCallback, useCallback } from 'react';
import { ContainerColor, ContainerColorVariants } from '$styles/ContainerColor.css';
import * as itemCss from './SidebarItem.css';
import * as avatarCss from './SidebarAvatar.css';
import * as folderCss from './SidebarFolder.css';
import { useRegisterActive } from './ActiveIndicatorContext';

type SidebarItemExtraProps = itemCss.SidebarItemVariants & {
  noIndicator?: boolean;
};

export const SidebarItem = as<'div', SidebarItemExtraProps>(
  ({ as: AsSidebarAvatarBox = 'div', className, active, noIndicator, ...props }, ref) => {
    const activeRef = useRegisterActive(!noIndicator && (active ?? false));

    const combinedRef = useCallback(
      (el: HTMLDivElement | null) => {
        activeRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) {
          const currentRef = ref as React.MutableRefObject<HTMLElement | null>;
          currentRef.current = el;
        }
      },
      [ref, activeRef]
    );

    return (
      <AsSidebarAvatarBox
        className={classNames(itemCss.SidebarItem({ active }), className)}
        data-active={active || undefined}
        data-sidebar-item
        {...props}
        ref={combinedRef}
      />
    );
  }
);

export const SidebarItemBadge = as<'div', itemCss.SidebarItemBadgeVariants>(
  ({ as: AsSidebarBadgeBox = 'div', className, hasCount, ...props }, ref) => (
    <AsSidebarBadgeBox
      className={classNames(itemCss.SidebarItemBadge({ hasCount }), className)}
      {...props}
      ref={ref}
    />
  )
);

export function SidebarItemTooltip({
  tooltip,
  children,
}: {
  tooltip?: ReactNode | string;
  children: (triggerRef: RefCallback<HTMLElement | SVGElement>) => ReactNode;
}) {
  if (!tooltip) {
    return children(() => undefined);
  }

  return (
    <TooltipProvider
      delay={400}
      position="Right"
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

type SidebarAvatarProps = avatarCss.SidebarAvatarVariants &
  ComponentProps<typeof Avatar> & {
    fill?: NonNullable<NonNullable<ContainerColorVariants>['variant']>;
  };

export const SidebarAvatar = as<'div', SidebarAvatarProps>(
  ({ className, fill, size, ghost, active, radii, ...props }, ref) => (
    <Avatar
      className={classNames(
        avatarCss.SidebarAvatar({ size, ghost, active }),
        !active && fill && ContainerColor({ variant: fill }),
        className
      )}
      radii={radii}
      {...props}
      ref={ref}
    />
  )
);

export const SidebarFolder = as<'div', folderCss.SidebarFolderVariants>(
  ({ as: AsSidebarFolder = 'div', className, state, ...props }, ref) => (
    <AsSidebarFolder
      className={classNames(folderCss.SidebarFolder({ state }), className)}
      data-sidebar-folder
      {...props}
      ref={ref}
    />
  )
);

export const SidebarFolderDropTarget = as<'div', folderCss.SidebarFolderDropTargetVariants>(
  ({ as: AsSidebarFolderDropTarget = 'div', className, position, ...props }, ref) => (
    <AsSidebarFolderDropTarget
      className={classNames(folderCss.SidebarFolderDropTarget({ position }), className)}
      {...props}
      ref={ref}
    />
  )
);
