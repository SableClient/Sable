import { style, styleVariants } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const IntegrationManagerOverlay = styleVariants({
  false: {
    width: '80vw',
    height: '80vh',
    maxWidth: toRem(960),
    maxHeight: toRem(720),
    backgroundColor: color.Background.Container,
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  true: {
    width: '100vw',
    height: '100vh',
    maxWidth: '100vw',
    maxHeight: '100vh',
    backgroundColor: color.Background.Container,
    borderRadius: config.radii.R0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
});

export const IntegrationManagerHeader = style({
  flexShrink: 0,
  padding: `0 ${config.space.S200} 0 ${config.space.S300}`,
  borderBottomWidth: config.borderWidth.B300,
});

export const IntegrationManagerIframe = style({
  flexGrow: 1,
  width: '100%',
  border: 'none',
  display: 'block',
});
