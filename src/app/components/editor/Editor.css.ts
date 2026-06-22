import { style } from '@vanilla-extract/css';
import { color, config, DefaultReset, toRem } from 'folds';

export const Editor = style([
  DefaultReset,
  {
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: config.radii.R400,
    overflow: 'hidden',
    width: '100%',
  },
]);

export const EditorRow = style({
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
});

export const EditorRowMultiline = style({
  gridTemplateColumns: 'auto 1fr',
  gridTemplateAreas: `
    "before textarea"
    "before after"
  `,
  alignItems: 'start',
});

export const EditorRowMultilineWithResponsiveAfter = style({
  gridTemplateColumns: 'auto 1fr auto',
  gridTemplateAreas: `
    "before textarea textarea"
    "before responsive-after after"
  `,
});

export const EditorOptions = style([
  DefaultReset,
  {
    padding: config.space.S200,
  },
]);

export const EditorOptionsMultiline = style({
  gridArea: 'before',
  alignSelf: 'end',
});

export const EditorOptionsAfterMultiline = style({
  gridArea: 'after',
  justifySelf: 'end',
});

export const EditorTextareaScrollMultiline = style({
  gridArea: 'textarea',
});

export const EditorTextareaScroll = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  padding: `${toRem(13)} 0`,
  selectors: {
    [`&${EditorTextareaScrollMultiline}`]: {
      display: 'block',
      paddingBottom: 0,
    },
  },
});

export const EditorTextarea = style([
  DefaultReset,
  {
    flexGrow: 1,
    height: 'auto',
    // Detect text direction per-keystroke so RTL text right-aligns automatically.
    // Matches the unicodeBidi: 'plaintext' pattern used by MessageTextBody.
    unicodeBidi: 'plaintext',
    padding: 0,
    paddingRight: toRem(13),
    selectors: {
      [`${EditorTextareaScroll}:first-child &`]: {
        paddingLeft: toRem(13),
      },
      [`${EditorTextareaScroll}:last-child &`]: {
        paddingRight: toRem(13),
      },
      '&:focus': {
        outline: 'none',
      },
    },
  },
]);

export const EditorResponsiveAfterMultiline = style([
  EditorOptions,
  {
    gridArea: 'responsive-after',
    minWidth: 0,
    alignSelf: 'stretch',
  },
]);

export const EditorFooterAfterMultiline = style([
  EditorOptions,
  {
    gridArea: 'after',
    justifySelf: 'end',
    alignSelf: 'stretch',
  },
]);

export const EditorPlaceholderContainer = style([
  DefaultReset,
  {
    opacity: config.opacity.Placeholder,
    pointerEvents: 'none',
    userSelect: 'none',
  },
]);

export const EditorPlaceholderTextVisual = style([
  DefaultReset,
  {
    display: 'block',
    paddingLeft: toRem(1),
    paddingRight: toRem(13),
    selectors: {
      [`${EditorTextareaScroll}:first-child &`]: {
        paddingLeft: toRem(13),
      },
    },
  },
]);

export const EditorToolbarBase = style({
  padding: `0 ${config.borderWidth.B300}`,
});

export const EditorToolbar = style({
  padding: config.space.S100,
});

export const MarkdownBtnBox = style({
  paddingRight: config.space.S100,
});
