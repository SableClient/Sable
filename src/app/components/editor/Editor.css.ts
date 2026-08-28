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
  alignItems: 'end',
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

export const EditorTextareaScroll = style({
  minWidth: 0,
});

export const EditorTextareaScrollMultiline = style({
  gridArea: 'textarea',
});

export const EditorTextarea = style([
  DefaultReset,
  {
    flexGrow: 1,
    height: 'auto',
    padding: `${toRem(13)} 0`,
    fontSize: '1rem',
    position: 'relative',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
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
      // ProseMirror owns the editable's children, so draw the placeholder as an
      // overlay; data-placeholder-visible is recomputed per transaction.
      '&[data-placeholder-visible="true"]::before': {
        content: 'attr(data-placeholder)',
        position: 'absolute',
        top: toRem(13),
        left: 0,
        right: 0,
        opacity: config.opacity.Placeholder,
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      [`${EditorTextareaScroll}:first-child &[data-placeholder-visible="true"]::before`]: {
        left: toRem(13),
      },
      [`${EditorTextareaScroll}:last-child &[data-placeholder-visible="true"]::before`]: {
        right: toRem(13),
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

export const EditorToolbarBase = style({
  padding: `0 ${config.borderWidth.B300}`,
});

export const EditorToolbar = style({
  padding: config.space.S100,
});
