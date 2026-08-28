import { keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const RecDotPulse = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.25 },
});

const SlideOutLeft = keyframes({
  '0%': { transform: 'translateX(0)', opacity: 1 },
  '100%': { transform: 'translateX(-100%)', opacity: 0 },
});

export const Container = style([
  DefaultReset,
  {
    width: '100%',
    maxWidth: toRem(280),
    minWidth: 0,
    overflow: 'hidden',
    userSelect: 'none',
  },
]);

export const ContainerCanceling = style({
  animation: `${SlideOutLeft} 200ms ease-out forwards`,
});

export const RecDot = style([
  DefaultReset,
  {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: color.Critical.Main,
    flexShrink: 0,
    animation: `${RecDotPulse} 1.4s ease-in-out infinite`,
  },
]);

export const WaveformContainer = style([
  DefaultReset,
  {
    height: 22,
    overflow: 'hidden',
    minWidth: 0,
    flexGrow: 1,
  },
]);

export const WaveformBar = style([
  DefaultReset,
  {
    width: 2,
    height: 3,
    borderRadius: 1,
    backgroundColor: color.Primary.Main,
    transition: 'height 70ms ease-out',
    flexShrink: 0,
  },
]);

export const Timer = style([
  DefaultReset,
  {
    fontVariantNumeric: 'tabular-nums',
    color: color.Critical.Main,
    minWidth: config.space.S300,
    flexShrink: 0,
    fontWeight: 600,
  },
]);

export const SrOnly = style([
  DefaultReset,
  {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
]);
