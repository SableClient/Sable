import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const AvatarBadgeContainer = style({
  position: 'relative',
  display: 'inline-block',
});

export const AvatarBadgeOverlay = style({
  position: 'absolute',
  bottom: -2,
  right: -2,
  minWidth: config.space.S200,
  height: config.space.S200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: config.radii.Pill,
  border: `2px solid var(--bg-surface)`,
  fontSize: '10px',
  fontWeight: 600,
  padding: '0 4px',
  boxSizing: 'border-box',
  zIndex: 1,
});

export const BadgeHighlight = style({
  backgroundColor: 'var(--bg-success)',
  color: 'var(--on-success)',
});

export const BadgeSecondary = style({
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--on-secondary)',
});
