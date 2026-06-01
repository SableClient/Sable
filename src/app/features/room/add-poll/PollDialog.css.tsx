import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const PollDialogBody = style({
  maxWidth: toRem(500),
  borderRadius: config.radii.R500,
  padding: config.space.S200,
  textAlign: 'justify',
});
export const PollDialogHeader = style({
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  borderBottomWidth: config.borderWidth.B300,
});
export const PollDialogTitle = style({
  padding: config.space.S400,
});
export const PollDialogAnswerBody = style({
  maxHeight: toRem(300),
  overflow: 'scroll',
});
export const PollDialogAnswerInput = style({ width: '100%' });
export const PollDialogMaxSelectionNumber = style({ width: toRem(80) });

export const PollDialogMaxSelectionSlider = style({
  width: '100%',
  cursor: 'pointer',
  appearance: 'none',
  height: toRem(6),
  borderRadius: config.radii.Pill,
  backgroundColor: color.Background.ContainerLine,
  accentColor: color.Primary.Main,
});
