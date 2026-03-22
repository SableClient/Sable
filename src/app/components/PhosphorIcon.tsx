import { toRem } from 'folds';
import { forwardRef, ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';

export type FoldIconSize = 'Inherit' | '50' | '100' | '200' | '300' | '400' | '500' | '600';
export type FoldIconSizeToken = 50 | 100 | 200 | 300 | 400 | 500 | 600;
export type FoldCompatibleIconSize = IconProps['size'] | FoldIconSize | FoldIconSizeToken;

const FOLD_TO_PHOSPHOR_SIZE = new Map<FoldIconSize | FoldIconSizeToken, IconProps['size']>([
  ['Inherit', '1em'],
  ['50', toRem(16)],
  [50, toRem(16)],
  ['100', toRem(18)],
  [100, toRem(18)],
  ['200', toRem(20)],
  [200, toRem(20)],
  ['300', toRem(22)],
  [300, toRem(22)],
  ['400', toRem(24)],
  [400, toRem(24)],
  ['500', toRem(28)],
  [500, toRem(28)],
  ['600', toRem(36)],
  [600, toRem(36)],
]);

const isFoldIconSizeToken = (
  size: FoldCompatibleIconSize
): size is FoldIconSize | FoldIconSizeToken =>
  FOLD_TO_PHOSPHOR_SIZE.has(size as FoldIconSize | FoldIconSizeToken);

export const toPhosphorIconSize = (
  size?: FoldCompatibleIconSize
): IconProps['size'] | undefined => {
  if (size === undefined) return undefined;
  if (isFoldIconSizeToken(size)) {
    return FOLD_TO_PHOSPHOR_SIZE.get(size);
  }
  return size;
};

export type PhosphorIconProps = Omit<IconProps, 'size'> & {
  as: ComponentType<IconProps>;
  size?: FoldCompatibleIconSize;
};

export const PhosphorIcon = forwardRef<SVGSVGElement, PhosphorIconProps>(
  ({ as: IconComponent, size = '400', ...props }, ref) => (
    <IconComponent {...props} ref={ref} size={toPhosphorIconSize(size)} />
  )
);

PhosphorIcon.displayName = 'PhosphorIcon';
