import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';
import { recipe } from '@vanilla-extract/recipes';

export const SpaceItemCard = recipe({
  base: {
    paddingBottom: config.space.S100,
    borderBottom: `${config.borderWidth.B300} solid transparent`,
    position: 'relative',
    selectors: {
      '&[data-dragging=true]': {
        opacity: config.opacity.Disabled,
      },
    },
  },
});
export const HeaderChip = style({
  paddingLeft: config.space.S200,
  selectors: {
    [`&[data-ui-before="true"]`]: {
      paddingLeft: config.space.S100,
    },
  },
});
export const HeaderChipPlaceholder = style([
  {
    borderRadius: config.radii.R400,
    paddingLeft: config.space.S100,
    paddingRight: config.space.S300,
    height: toRem(32),
  },
]);
