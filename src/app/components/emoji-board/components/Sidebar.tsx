import { ReactNode, ComponentType } from 'react';
import { Box, Scroll, Line, as, TooltipProvider, Tooltip, Text, IconButton } from 'folds';
import type { IconProps } from '@phosphor-icons/react';
import { ImageSquareIcon } from '@phosphor-icons/react/dist/csr/ImageSquare';
import classNames from 'classnames';
import { PhosphorIcon } from '$components/PhosphorIcon';
import * as css from './styles.css';

export function Sidebar({ children }: { children: ReactNode }) {
  return (
    <Box className={css.Sidebar} shrink="No">
      <Scroll size="0">
        <Box className={css.SidebarContent} direction="Column" alignItems="Center" gap="100">
          {children}
        </Box>
      </Scroll>
    </Box>
  );
}

export const SidebarStack = as<'div'>(({ className, children, ...props }, ref) => (
  <Box
    className={classNames(css.SidebarStack, className)}
    direction="Column"
    alignItems="Center"
    gap="100"
    {...props}
    ref={ref}
  >
    {children}
  </Box>
));
export function SidebarDivider() {
  return <Line className={css.SidebarDivider} size="300" variant="Surface" />;
}

function SidebarBtn<T extends string>({
  active,
  label,
  id,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  id: T;
  onClick: (id: T) => void;
  children: ReactNode;
}) {
  return (
    <TooltipProvider
      delay={500}
      position="Left"
      tooltip={
        <Tooltip id={`SidebarStackItem-${id}-label`}>
          <Text size="T300">{label}</Text>
        </Tooltip>
      }
    >
      {(ref) => (
        <IconButton
          aria-pressed={active}
          aria-labelledby={`SidebarStackItem-${id}-label`}
          ref={ref}
          onClick={() => onClick(id)}
          size="400"
          radii="300"
          variant="Surface"
        >
          {children}
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type GroupIconProps<T extends string> = {
  active: boolean;
  id: T;
  label: string;
  icon: ComponentType<IconProps>;
  onClick: (id: T) => void;
};
export function GroupIcon<T extends string>({
  active,
  id,
  label,
  icon,
  onClick,
}: GroupIconProps<T>) {
  return (
    <SidebarBtn active={active} id={id} label={label} onClick={onClick}>
      <PhosphorIcon as={icon} weight={active ? 'fill' : 'regular'} />
    </SidebarBtn>
  );
}

type ImageGroupIconProps<T extends string> = {
  active: boolean;
  id: T;
  label: string;
  url?: string;
  onClick: (id: T) => void;
};
export function ImageGroupIcon<T extends string>({
  active,
  id,
  label,
  url,
  onClick,
}: ImageGroupIconProps<T>) {
  return (
    <SidebarBtn active={active} id={id} label={label} onClick={onClick}>
      {url ? (
        <img className={css.SidebarBtnImg} src={url} alt={label} />
      ) : (
        <PhosphorIcon as={ImageSquareIcon} weight={active ? 'fill' : 'regular'} />
      )}
    </SidebarBtn>
  );
}
