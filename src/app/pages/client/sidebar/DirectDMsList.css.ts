import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const GroupAvatarGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: config.space.S50,
  width: config.space.S400,
  height: config.space.S400,
  padding: config.space.S50,
});

export const GroupAvatar = style({
  width: '100%',
  height: '100%',
});
