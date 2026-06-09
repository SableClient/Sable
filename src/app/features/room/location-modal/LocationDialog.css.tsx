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
export const LocationDialogTitle = style({
  padding: config.space.S400,
  alignItems: 'center',
  textAlign: 'center',
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
export const LocationDialogAnswerInput = style({ width: '100%' });

export const LocationDialogMaxSelectionSlider = style({
  width: '100%',
  cursor: 'pointer',
  appearance: 'none',
  height: toRem(6),
  borderRadius: config.radii.Pill,
  backgroundColor: color.Background.ContainerLine,
  accentColor: color.Primary.Main,
});
