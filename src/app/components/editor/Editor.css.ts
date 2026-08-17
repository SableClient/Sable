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

export const EditorMarkdownToken = style({
  opacity: 0.4,
});

// Matches the dimmed block markers and the sent renderer's <hr> border.
export const EditorMarkdownDivider = style({
  opacity: 0.4,
  borderBottom: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
});

export const EditorMarkdownItalic = style({
  fontStyle: 'italic',
});

export const EditorMarkdownUnderline = style({
  textDecoration: 'underline',
});

export const EditorMarkdownStrikeThrough = style({
  textDecoration: 'line-through',
});

export const EditorMarkdownLink = style({
  color: color.Primary.OnContainer,
});

export const EditorMarkdownCode = style([
  DefaultReset,
  {
    fontFamily: 'var(--font-monospace)',
    fontSize: '0.9em',
    color: color.SurfaceVariant.OnContainer,
    background: color.SurfaceVariant.Container,
    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: config.radii.R300,
    padding: `0 ${config.space.S100}`,
  },
]);

export const EditorMarkdownCodeBlock = style({
  fontFamily: 'var(--font-monospace)',
  fontSize: '0.9em',
  lineHeight: 1.3,
  letterSpacing: '-0.01em',
  fontVariantLigatures: 'contextual',
  background: color.SurfaceVariant.Container,
});

// Heading levels reuse folds' own heading sizes/weights so the preview matches
// the sent renderer exactly (the message parser maps `#`…`######` onto
// Text sizes H2…H6, all at weight 600).
const heading = (size: 'H2' | 'H3' | 'H4' | 'H5' | 'H6') =>
  style({
    fontSize: config.fontSize[size],
    lineHeight: config.lineHeight[size],
    letterSpacing: config.letterSpacing[size],
    fontWeight: config.fontWeight.W600,
  });

export const EditorMarkdownHeading1 = heading('H2');
export const EditorMarkdownHeading2 = heading('H3');
export const EditorMarkdownHeading3 = heading('H4');
export const EditorMarkdownHeading4 = heading('H4');
export const EditorMarkdownHeading5 = heading('H5');
export const EditorMarkdownHeading6 = heading('H6');

// Declared after the heading classes so its 700 weight beats a heading's 600
// when `# **bold**` stacks both classes onto one span (as the sent renderer's
// `<strong>` inside the heading does).
export const EditorMarkdownBold = style({
  fontWeight: 700,
});

export const EditorMarkdownSpoiler = style({
  backgroundColor: `color-mix(in srgb, ${color.SurfaceVariant.ContainerLine} 30%, transparent)`,
  borderRadius: config.radii.R300,
});

export const EditorMarkdownPreviewContent = style({
  maxHeight: toRem(220),
  overscrollBehavior: 'contain',
});
