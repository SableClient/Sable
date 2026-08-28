import { style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';

export const Sheet = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  // The panel supplies the safe-area inset; this is just the gutter under the actions.
  paddingBottom: toRem(12),
  overflowX: 'hidden',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
});

export const SheetHeader = style({
  position: 'relative',
  flexShrink: 0,
  padding: `0 ${toRem(16)} ${toRem(8)}`,
});

export const Heading = style({
  margin: 0,
  color: color.Surface.OnContainer,
  fontSize: toRem(16),
  fontWeight: 700,
  lineHeight: toRem(22),
});

export const ActionsRow = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  padding: `${toRem(4)} ${toRem(12)} 0`,
  gap: toRem(8),
  flexShrink: 0,
  minWidth: 0,
});

export const ActionButton = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: toRem(7),
  minWidth: 0,
  minHeight: toRem(76),
  padding: `${toRem(8)} ${toRem(4)}`,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: toRem(12),
  transition: 'background-color 0.15s ease',
  color: color.Surface.OnContainer,

  ':hover': {
    background: color.Surface.ContainerHover,
  },

  ':focus-visible': {
    outline: `${toRem(2)} solid ${color.Primary.Main}`,
    outlineOffset: toRem(-2),
  },

  ':active': {
    background: color.Surface.ContainerActive,
  },

  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
});

export const ActionIcon = style({
  display: 'grid',
  placeItems: 'center',
  width: toRem(44),
  height: toRem(44),
  flexShrink: 0,
  borderRadius: '50%',
  color: color.SurfaceVariant.OnContainer,
  background: color.SurfaceVariant.Container,
});

export const ActionLabel = style({
  fontSize: toRem(12),
  lineHeight: toRem(16),
  textAlign: 'center',
  color: color.Surface.OnContainer,
  overflowWrap: 'anywhere',
});

export const GallerySection = style({
  padding: `${toRem(4)} ${toRem(16)} ${toRem(8)}`,
  flexShrink: 0,
  minWidth: 0,
});

export const GalleryButton = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: toRem(14),
  width: '100%',
  minWidth: 0,
  minHeight: toRem(72),
  boxSizing: 'border-box',
  padding: toRem(10),
  border: `${toRem(1)} solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(16),
  background: color.Surface.ContainerHover,
  color: color.Surface.OnContainer,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.15s ease, border-color 0.15s ease',

  ':hover': {
    background: color.Surface.ContainerActive,
  },

  ':focus-visible': {
    outline: `${toRem(2)} solid ${color.Primary.Main}`,
    outlineOffset: toRem(2),
  },

  ':active': {
    background: color.Surface.ContainerActive,
  },

  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
});

export const GalleryIcon = style({
  display: 'grid',
  placeItems: 'center',
  width: toRem(52),
  height: toRem(52),
  flexShrink: 0,
  borderRadius: toRem(13),
  color: color.Primary.OnContainer,
  background: color.Primary.Container,
});

export const GalleryCopy = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flexGrow: 1,
});

export const GalleryTitle = style({
  color: color.Surface.OnContainer,
  fontSize: toRem(14),
  fontWeight: 700,
  lineHeight: toRem(20),
});

export const GalleryGrid = style({
  color: color.Surface.OnContainer,
  opacity: 0.55,
  flexShrink: 0,
  marginRight: toRem(4),
});

export const GalleryLabel = style({
  fontSize: toRem(12),
  lineHeight: toRem(17),
  color: color.Surface.OnContainer,
  opacity: 0.68,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
