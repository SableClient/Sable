import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Container = style({
  position: 'fixed',
  top: 'calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 16px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 9998,
  width: `min(calc(100vw - 32px), ${toRem(540)})`,
  pointerEvents: 'none',
});

export const Banner = style({
  pointerEvents: 'all',
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  backgroundColor:
    'color-mix(in srgb, var(--sable-surface-var-container, #e4e4e7) 78%, transparent)',
  color: color.SurfaceVariant.OnContainer,
  border: `${config.borderWidth.B300} solid color-mix(in srgb, var(--sable-surface-var-container-line, #71717a) 70%, transparent)`,
  borderRadius: toRem(16),
  padding: config.space.S400,
  boxShadow: '0 10px 32px rgba(0, 0, 0, 0.22)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
});

export const Header = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: config.space.S300,
});

export const IconContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: toRem(2),
  color: 'var(--sable-primary-main)',
});

export const HeaderText = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(4),
});

export const Actions = style({
  display: 'flex',
  gap: config.space.S200,
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
});
