import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

// Yellow glow animation for unverified session warning
const glowPulse = keyframes({
  '0%, 100%': {
    boxShadow: `0 0 ${toRem(4)} ${toRem(8)} ${color.Warning.Main}40`,
  },
  '50%': {
    boxShadow: `0 0 ${toRem(8)} ${toRem(16)} ${color.Warning.Main}60`,
  },
});

export const UnverifiedGlowBorder = style({
  animation: `${glowPulse} 2s ease-in-out infinite`,
  borderRadius: config.radii.R400,
});
