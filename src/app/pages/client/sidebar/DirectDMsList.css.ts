import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const GroupAvatarContainer = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
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
  width: '28px',
  height: '28px',
  selectors: {
    // First avatar (most recent) - top center
    '&:nth-child(1)': {
      top: '4px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '3',
    },
    // Second avatar - bottom left
    '&:nth-child(2)': {
      bottom: '4px',
      left: '6px',
      zIndex: '2',
    },
    // Third avatar - bottom right
    '&:nth-child(3)': {
      bottom: '4px',
      right: '6px',
      zIndex: '1',
    },
  },
});
