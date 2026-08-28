import { keyframes } from '@vanilla-extract/css';
import { recipe } from '@vanilla-extract/recipes';
import { color } from 'folds';

const PulseCritical = keyframes({
  '0%, 100%': {
    color: color.Critical.OnContainer,
  },
  '50%': {
    color: color.Surface.OnContainer,
  },
});

const PulseWarning = keyframes({
  '0%, 100%': {
    color: color.Warning.OnContainer,
  },
  '50%': {
    color: color.Surface.OnContainer,
  },
});

export const UnverifiedDevices = recipe({
  base: {
    position: 'relative',
    background: color.Surface.Container,
  },
  variants: {
    critical: {
      true: {
        animation: `${PulseCritical} 2s infinite`,
      },
      false: {
        animation: `${PulseWarning} 2s infinite`,
      },
    },
  },
});

export const UnverifiedDevicesReduced = recipe({
  base: {},
  variants: {
    critical: {
      true: {
        color: color.Critical.OnContainer,
      },
      false: {
        color: color.Warning.OnContainer,
      },
    },
  },
});
