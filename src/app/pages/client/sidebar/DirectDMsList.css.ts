import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const GroupAvatarGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: config.space.S50,
  width: 'auto',
  height: 'auto',
});

export const GroupAvatar = style({
  width: config.space.S500,
  height: config.space.S500,
});
