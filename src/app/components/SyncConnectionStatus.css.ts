import { keyframes, style } from '@vanilla-extract/css';

const bannerEnter = keyframes({
  from: { opacity: 0, transform: 'translate3d(0, -30px, 0) scale(0.95)' },
  to: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
});

const bannerExit = keyframes({
  from: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
  to: { opacity: 0, transform: 'translate3d(0, -20px, 0) scale(0.95)' },
});

const pillEnter = keyframes({
  from: {
    opacity: 0,
    transform: 'translate3d(0, -2px, 0) scaleX(0.98) scaleY(0.96)',
    clipPath: 'inset(0 50% 0 50% round 999px)',
  },
  to: {
    opacity: 1,
    transform: 'translate3d(0, 0, 0) scaleX(1) scaleY(1)',
    clipPath: 'inset(0 0% 0 0% round 999px)',
  },
});

const pillExit = keyframes({
  '0%': {
    opacity: 1,
    transform: 'translate3d(0, 0, 0) scaleX(1) scaleY(1)',
    clipPath: 'inset(0 0% 0 0% round 999px)',
  },
  '40%': {
    opacity: 1,
    transform: 'translate3d(0, -2px, 0) scaleX(0.98) scaleY(0.96)',
    clipPath: 'inset(0 50% 0 50% round 999px)',
  },
  to: {
    opacity: 0,
    transform: 'translate3d(0, -2px, 0) scaleX(0.98) scaleY(0.96)',
    clipPath: 'inset(0 50% 0 50% round 999px)',
  },
});

const textEnter = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const textExit = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const reducedEnter = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const reducedExit = keyframes({
  '0%': { opacity: 1 },
  '45%': { opacity: 1 },
  to: { opacity: 0 },
});

export const BannerEnter = style({
  animation: `${bannerEnter} 220ms cubic-bezier(0.32, 0.72, 0, 1)`,
  willChange: 'transform, opacity',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: `${reducedEnter} 200ms ease-out`,
    },
  },
});

export const BannerExit = style({
  animation: `${bannerExit} 150ms cubic-bezier(0.32, 0.72, 0, 1)`,
  willChange: 'transform, opacity',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: `${reducedExit} 180ms ease-out`,
    },
  },
});

export const TitlebarPillEnter = style({
  animation: `${pillEnter} 200ms cubic-bezier(0.32, 0.72, 0, 1)`,
  willChange: 'transform, opacity, clip-path',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: `${reducedEnter} 180ms cubic-bezier(0.32, 0.72, 0, 1)`,
    },
  },
});

export const TitlebarPillExit = style({
  animation: `${pillExit} 200ms cubic-bezier(0.32, 0.72, 0, 1)`,
  willChange: 'transform, opacity, clip-path',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: `${reducedExit} 180ms ease-out`,
    },
  },
});

export const TitlebarTextEnter = style({
  animation: `${textEnter} 120ms cubic-bezier(0.24, 0.72, 0.08, 1) 40ms both`,
  willChange: 'opacity',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: `${textEnter} 120ms cubic-bezier(0.32, 0.72, 0, 1) both`,
    },
  },
});

export const TitlebarTextExit = style({
  animation: `${textExit} 100ms cubic-bezier(0.24, 0.72, 0.08, 1)`,
  willChange: 'opacity',
});
