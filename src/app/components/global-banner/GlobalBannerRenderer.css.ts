import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

const enter = keyframes({
  from: { opacity: 0, transform: 'translate3d(0, -24px, 0) scale(0.96)' },
  to: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
});

const exit = keyframes({
  from: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
  to: { opacity: 0, transform: 'translate3d(0, -16px, 0) scale(0.96)' },
});

const reducedEnter = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const reducedExit = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

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

export const BannerEnter = style({
  animation: `${enter} 220ms cubic-bezier(0.22, 1, 0.36, 1)`,
  willChange: 'transform, opacity',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: `${reducedEnter} 200ms ease-out`,
    },
  },
});

export const BannerExit = style({
  animation: `${exit} 150ms cubic-bezier(0.32, 0.72, 0, 1)`,
  willChange: 'transform, opacity',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: `${reducedExit} 150ms ease-out`,
    },
  },
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
