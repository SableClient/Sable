import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

const slideUp = keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(100%)',
  },
  to: {
    opacity: 1,
    transform: 'translateY(0)',
  },
});

const slideDown = keyframes({
  from: {
    opacity: 1,
    transform: 'translateY(0)',
  },
  to: {
    opacity: 0,
    transform: 'translateY(100%)',
  },
});

export const Container = style({
  position: 'fixed',
  bottom: 'env(safe-area-inset-bottom, 0)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 9998,
  width: `min(100%, ${toRem(520)})`,
  padding: config.space.S400,
  pointerEvents: 'none',
});

export const Banner = style({
  pointerEvents: 'all',
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(16),
  padding: config.space.S400,
  boxShadow: `0 ${toRem(8)} ${toRem(32)} rgba(0, 0, 0, 0.45), 0 ${toRem(2)} ${toRem(8)} rgba(0, 0, 0, 0.3)`,
  animationName: slideUp,
  animationDuration: '300ms',
  animationTimingFunction: 'cubic-bezier(0.22, 0.8, 0.6, 1)',
  animationFillMode: 'both',

  selectors: {
    '&[data-dismissing=true]': {
      animationName: slideDown,
      animationDuration: '220ms',
      animationTimingFunction: 'cubic-bezier(0.4, 0, 1, 1)',
      animationFillMode: 'both',
    },
  },
});

export const Header = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: config.space.S300,
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
