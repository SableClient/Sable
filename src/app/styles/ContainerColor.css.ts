import type { ComplexStyleRule } from '@vanilla-extract/css';
import type { RecipeVariants } from '@vanilla-extract/recipes';
import { recipe } from '@vanilla-extract/recipes';
import type { ContainerColor as TContainerColor } from 'folds';
import { DefaultReset, color, config } from 'folds';

const getVariant = (variant: TContainerColor): ComplexStyleRule => ({
  vars: {
    backgroundColor: color[variant].Container,
    borderColor: color[variant].ContainerLine,
    outlineColor: color[variant].ContainerLine,
    color: color[variant].OnContainer,
  },
  selectors: {
    'button&[aria-pressed=true]': {
      backgroundColor: color[variant].ContainerActive,
    },
    'button&:hover, &:focus-visible': {
      backgroundColor: color[variant].ContainerHover,
    },
    'button&:active': {
      backgroundColor: color[variant].ContainerActive,
    },
    'button&[disabled]': {
      opacity: config.opacity.Disabled,
    },
  },
});

export const ContainerColor = recipe({
  base: [DefaultReset],
  variants: {
    variant: {
      Background: getVariant('Background'),
      Surface: getVariant('Surface'),
      SurfaceVariant: getVariant('SurfaceVariant'),
      Primary: getVariant('Primary'),
      Secondary: getVariant('Secondary'),
      Success: getVariant('Success'),
      Warning: getVariant('Warning'),
      Critical: getVariant('Critical'),
    },
  },
  defaultVariants: {
    variant: 'Surface',
  },
});

export type ContainerColorVariants = RecipeVariants<typeof ContainerColor>;
