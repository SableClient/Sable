import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const GroupAvatarGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 2,
  width: config.space.S500,
  height: config.space.S500,
});

export const GroupAvatar = style({
  width: '100%',
  height: '100%',
});
