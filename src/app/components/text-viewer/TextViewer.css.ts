import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

export const TextViewer = style([
  DefaultReset,
  {
    height: '100%',
  },
]);

export const TextViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S200,
    paddingRight: config.space.S200,
    borderBottomWidth: config.borderWidth.B300,
    flexShrink: 0,
    gap: config.space.S200,
    flexWrap: 'wrap',
    justifyContent: 'center',
    height: 'auto',
    minHeight: config.space.S400,
    paddingTop: config.space.S100,
    paddingBottom: config.space.S100,
  },
]);

export const TextViewerContent = style([
  DefaultReset,
  {
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
    overflow: 'hidden',
  },
]);

export const TextViewerPre = style([
  DefaultReset,
  {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    fontSize: '1rem !important',
    lineHeight: 'inherit',
  },
]);

export const TextViewerPrePadding = style({
  padding: config.space.S600,
});
