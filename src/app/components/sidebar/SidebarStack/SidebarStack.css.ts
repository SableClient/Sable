import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, DefaultReset } from 'folds';

export const SidebarStack = recipe({
  base: [
    DefaultReset,
    {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: config.space.S300,
      padding: `${config.space.S200} 0`,
      selectors: {
        '&:empty': {
          display: 'none',
        },
      },
    },
  ],
  variants: {
    shield: {
      true: {
        position: 'relative',
        backgroundColor: color.Surface.Container,
        backgroundClip: 'padding-box',
        border: `0.5rem solid transparent`,
        borderRadius: `calc(${config.radii.R400} + 0.75rem)`,
      },
    },
    fill: {
      Background: { backgroundColor: color.Background.Container },
      Surface: { backgroundColor: color.Surface.Container },
      SurfaceVariant: { backgroundColor: color.SurfaceVariant.Container },
      Primary: { backgroundColor: color.Primary.Container },
    },
  },
});
export type SidebarStackVariants = RecipeVariants<typeof SidebarStack>;
