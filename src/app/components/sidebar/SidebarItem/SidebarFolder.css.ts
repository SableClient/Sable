import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, FocusOutline, toRem } from 'folds';
import { ContainerColor } from '$styles/ContainerColor.css';
import { DropTarget } from './SidebarItem.css';

export const SidebarFolder = recipe({
  base: [
    ContainerColor({ variant: 'Background' }),
    {
      padding: config.space.S200,
      width: '100%',
      display: 'flex',
      flexWrap: 'wrap',
      backgroundColor: color.Surface.Container,
      position: 'relative',

      selectors: {
        'button&': {
          cursor: 'pointer',
        },
      },
    },
    FocusOutline,
    DropTarget,
  ],
  variants: {
    state: {
      Close: {
        gap: toRem(2),
        borderRadius: config.radii.R400,
        aspectRatio: '1',
        padding: config.space.S200,
      },
      Open: {
        paddingLeft: 0,
        paddingRight: 0,
        flexDirection: 'column',
        alignItems: 'center',
        gap: config.space.S200,
        borderRadius: config.radii.R500,
      },
    },
  },
  defaultVariants: {
    state: 'Close',
  },
});
export type SidebarFolderVariants = RecipeVariants<typeof SidebarFolder>;

export const SidebarFolderDropTarget = recipe({
  base: {
    width: '100%',
    height: toRem(8),
    position: 'absolute',
    left: 0,
  },
  variants: {
    position: {
      Top: {
        top: toRem(-4),
      },
      Bottom: {
        bottom: toRem(-4),
      },
    },
  },
});
export type SidebarFolderDropTargetVariants = RecipeVariants<typeof SidebarFolderDropTarget>;
