import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const CategoryButton = style({
  flexGrow: 1,
});
export const CategoryButtonIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 0,
  opacity: config.opacity.P400,
});

export const NavItemChipIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 0,
  flexShrink: 0,
});
