import { style, globalStyle } from '@vanilla-extract/css';
import { color, config, DefaultReset, toRem } from 'folds';

export const TiptapEditorRoot = style([
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

export const TiptapEditorRow = style({
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
});

export const TiptapEditorRowMultiline = style({
  gridTemplateColumns: 'auto 1fr',
  gridTemplateAreas: `
    "before textarea"
    "before after"
  `,
  alignItems: 'start',
});

export const TiptapEditorOptions = style([
  DefaultReset,
  {
    padding: config.space.S200,
  },
]);

export const TiptapEditorOptionsMultiline = style({
  gridArea: 'before',
  alignSelf: 'end',
});

export const TiptapEditorOptionsAfterMultiline = style({
  gridArea: 'after',
  justifySelf: 'end',
});

export const TiptapEditorScrollArea = style({
  minWidth: 0,
});

export const TiptapEditorScrollAreaMultiline = style({
  gridArea: 'textarea',
});

export const TiptapEditorContent = style([
  DefaultReset,
  {
    flexGrow: 1,
    height: 'auto',
    padding: `${toRem(13)} 0 0`,
    selectors: {
      [`${TiptapEditorScrollArea}:first-child &`]: {
        paddingLeft: toRem(13),
      },
      [`${TiptapEditorScrollArea}:last-child &`]: {
        paddingRight: toRem(13),
      },
      '&:focus': {
        outline: 'none',
      },
    },
  },
]);

/** Wraps the ProseMirror editable div — resets prose styles from host page. */
export const TiptapProseMirrorWrapper = style({});

globalStyle(`${TiptapProseMirrorWrapper} .ProseMirror`, {
  outline: 'none',
  minHeight: toRem(20),
  paddingBottom: toRem(13),
  wordBreak: 'break-word',
  overflowWrap: 'break-word',
});

globalStyle(`${TiptapProseMirrorWrapper} .ProseMirror p`, {
  margin: 0,
});

globalStyle(`${TiptapProseMirrorWrapper} .ProseMirror p.is-editor-empty:first-child::before`, {
  content: 'attr(data-placeholder)',
  float: 'left',
  color: color.SurfaceVariant.OnContainer,
  opacity: config.opacity.Placeholder,
  pointerEvents: 'none',
  height: '0',
});

globalStyle(`${TiptapProseMirrorWrapper} [data-mention]`, {
  display: 'inline',
  borderRadius: config.radii.R300,
  padding: `0 ${toRem(2)}`,
  backgroundColor: color.Secondary.Container,
  color: color.Secondary.OnContainer,
  cursor: 'default',
  userSelect: 'none',
});

globalStyle(`${TiptapProseMirrorWrapper} [data-emoticon] img`, {
  height: toRem(20),
  verticalAlign: 'middle',
});

globalStyle(`${TiptapProseMirrorWrapper} [data-command]`, {
  display: 'inline',
  borderRadius: config.radii.R300,
  padding: `0 ${toRem(2)}`,
  backgroundColor: color.Primary.Container,
  color: color.Primary.OnContainer,
  cursor: 'default',
  userSelect: 'none',
});
