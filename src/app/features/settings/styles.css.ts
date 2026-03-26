import { keyframes, style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const SequenceCardStyle = style({
  padding: config.space.S300,
});

const focusPulse = keyframes({
  '0%': {
    backgroundColor: 'transparent',
    boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.Primary.ContainerLine}`,
  },
  '20%': {
    backgroundColor: `color-mix(in srgb, ${color.Primary.Container} 20%, transparent)`,
  },
  '50%': {
    backgroundColor: `color-mix(in srgb, ${color.Primary.Container} 8%, transparent)`,
  },
  '100%': {
    backgroundColor: 'transparent',
    boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.Primary.ContainerLine}`,
  },
});

export const focusedSettingTile = style({
  borderRadius: config.radii.R400,
  animation: `${focusPulse} 3s ease-in-out 1`,
});
