import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

// Subtle yellow inset glow for unverified session warning
const glowPulse = keyframes({
  '0%, 100%': {
    boxShadow: `inset 0 0 ${toRem(10)} ${toRem(2)} ${color.Warning.Main}20`,
  },
  '50%': {
    boxShadow: `inset 0 0 ${toRem(16)} ${toRem(4)} ${color.Warning.Main}30`,
  },
});

export const UnverifiedGlowBorder = style({
  animation: `${glowPulse} 2s ease-in-out infinite`,
  borderRadius: config.radii.R400,
});
