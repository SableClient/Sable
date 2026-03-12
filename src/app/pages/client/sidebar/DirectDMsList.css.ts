import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const GroupAvatarContainer = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const GroupAvatarRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
});

export const GroupAvatar = style({
  marginLeft: '-8px',
  border: `2px solid ${color.Surface.Container}`,
  borderRadius: '50%',
  overflow: 'hidden',
  selectors: {
    '&:first-child': {
      marginLeft: '0',
    },
  },
});
