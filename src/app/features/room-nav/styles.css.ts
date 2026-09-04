import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

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

export const SpeakerAvatarRing = style({
  boxShadow: `0 0 0 ${config.borderWidth.B600} ${color.Success.Main}`,
  borderRadius: config.radii.Pill,
});
