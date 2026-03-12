import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const GroupAvatarContainer = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
});

export const GroupAvatarRow = style({
  position: 'relative',
  width: '100%',
  height: '100%',
});

export const GroupAvatar = style({
  position: 'absolute',
  border: `2px solid ${color.Surface.Container}`,
  borderRadius: '50%',
  overflow: 'hidden',
  width: '24px',
  height: '24px',
  selectors: {
    // First avatar (most recent) - top center
    '&:nth-child(1)': {
      top: '0',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '3',
    },
    // Second avatar - bottom left
    '&:nth-child(2)': {
      bottom: '0',
      left: '0',
      zIndex: '2',
    },
    // Third avatar - bottom right
    '&:nth-child(3)': {
      bottom: '0',
      right: '0',
      zIndex: '1',
    },
  },
});
