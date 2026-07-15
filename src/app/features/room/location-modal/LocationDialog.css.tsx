import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const LocationDialogBody = style({
  maxWidth: toRem(500),
  borderRadius: config.radii.R500,
  padding: config.space.S200,
  textAlign: 'justify',
});
export const LocationDialogHeader = style({
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  borderBottomWidth: config.borderWidth.B300,
});
export const LocationDialogItems = style({
  padding: config.space.S400,
  alignItems: 'center',
  textAlign: 'center',
});
export const LocationDialogButtons = style({
  width: '100%',
});
export const LocationDialogErrorText = style({
  color: color.Critical.Main,
});
export const LocationInputs = style({
  width: '100%',
});
export const LocationInputItem = style({
  textAlign: 'center',
  width: '100%',
  justifyContent: 'center',
  flexShrink: '1',
});
export const LocationInputField = style({
  textAlign: 'center',
});
export const LocationInputCurLocation = style({
  textAlign: 'center',
  width: '60%',
  justifyContent: 'center',
  flexShrink: '1',
});
export const LocationInputClipboard = style({
  textAlign: 'center',
  width: '40%',
  justifyContent: 'center',
  flexShrink: '1',
});
export const LocationMapBody = style({
  width: '100%',
  height: toRem(400),
  borderRadius: config.radii.R400,
  overflow: 'hidden',
});
export const LocationMapContainer = style({ width: '100%', height: '100%' });
