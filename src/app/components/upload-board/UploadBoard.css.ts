import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const UploadBoardBase = style([
  DefaultReset,
  {
    borderBottom: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  },
]);

export const UploadBoardContainer = style([
  DefaultReset,
  {
    width: '100%',
  },
]);

export const UploadBoard = style({
  width: '100%',
  overflow: 'hidden',
});

export const UploadBoardHeaderContent = style({
  height: '100%',
  padding: `0 ${config.space.S200}`,
});

export const UploadBoardContent = style({
  padding: config.space.S200,
  paddingBottom: 0,
});
