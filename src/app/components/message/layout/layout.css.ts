import { createVar, keyframes, style, styleVariants } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

export const StickySection = style({
  position: 'sticky',
  top: config.space.S100,
});

const SpacingVar = createVar();
const SpacingVariant = styleVariants({
  '0': {
    vars: {
      [SpacingVar]: config.space.S0,
    },
  },
  '100': {
    vars: {
      [SpacingVar]: config.space.S100,
    },
  },
  '200': {
    vars: {
      [SpacingVar]: config.space.S200,
    },
  },
  '300': {
    vars: {
      [SpacingVar]: config.space.S300,
    },
  },
  '400': {
    vars: {
      [SpacingVar]: config.space.S400,
    },
  },
  '500': {
    vars: {
      [SpacingVar]: config.space.S500,
    },
  },
});

const highlightAnime = keyframes({
  '0%': {
    backgroundColor: color.Primary.Container,
  },
  '25%': {
    backgroundColor: color.Primary.ContainerActive,
  },
  '50%': {
    backgroundColor: color.Primary.Container,
  },
  '75%': {
    backgroundColor: color.Primary.ContainerActive,
  },
  '100%': {
    backgroundColor: color.Primary.Container,
  },
});
const HighlightVariant = styleVariants({
  true: {
    animation: `${highlightAnime} 2000ms ease-in-out`,
    animationIterationCount: 'infinite',
  },
});

const NotifyHighlightVariant = styleVariants({
  silent: {
    backgroundColor: color.Secondary.Container,
    boxShadow: `inset ${config.borderWidth.B700} 0 0 ${color.Secondary.ContainerLine}`,
  },
  loud: {
    backgroundColor: color.Warning.Container,
    boxShadow: `inset ${config.borderWidth.B700} 0 0 ${color.Warning.ContainerLine}`,
  },
});

const SelectedVariant = styleVariants({
  true: {
    backgroundColor: color.Surface.ContainerActive,
  },
});

const AutoCollapse = style({
  selectors: {
    [`&+&`]: {
      marginTop: 0,
    },
  },
});

export const MessageBase = recipe({
  base: [
    DefaultReset,
    {
      marginTop: SpacingVar,
      padding: `${config.space.S100} ${config.space.S200} ${config.space.S100} ${config.space.S400}`,
      borderRadius: `0 ${config.radii.R400} ${config.radii.R400} 0`,
      minHeight: toRem(16),
      contain: 'layout',
    },
  ],
  variants: {
    space: SpacingVariant,
    collapse: {
      true: {
        marginTop: 0,
      },
    },
    autoCollapse: {
      true: AutoCollapse,
    },
    highlight: HighlightVariant,
    notifyHighlight: NotifyHighlightVariant,
    selected: SelectedVariant,
  },
  defaultVariants: {
    space: '400',
  },
});

export type MessageBaseVariants = RecipeVariants<typeof MessageBase>;

export const CompactHeader = style([
  DefaultReset,
  StickySection,
  {
    maxWidth: toRem(170),
    width: '100%',
  },
]);

export const AvatarBase = style({
  paddingTop: toRem(4),
  transition: 'transform 200ms cubic-bezier(0, 0.8, 0.67, 0.97)',
  display: 'flex',
  alignSelf: 'start',

  selectors: {
    '&:hover': {
      transform: `translateY(${toRem(-2)})`,
    },
  },
});

export const ModernBefore = style({
  minWidth: toRem(36),
});

export const BubbleBefore = style({
  minWidth: toRem(36),
});

export const BubbleWrapper = style({
  maxWidth: '100%',
  minWidth: 0,
});

export const BubbleContent = style({
  maxWidth: `min(${toRem(800)}, 100%)`,
  minWidth: 0,
  padding: config.space.S200,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  borderRadius: config.radii.R500,
  position: 'relative',
});

export const BubbleContentArrowLeft = style({
  borderTopLeftRadius: 0,
});

export const BubbleContentArrowRight = style({
  borderTopRightRadius: 0,
});

export const BubbleLeftArrow = style({
  width: toRem(9),
  height: toRem(8),

  position: 'absolute',
  top: 0,
  left: toRem(-8),
  zIndex: 1,
});

export const BubbleRightArrow = style({
  width: toRem(9),
  height: toRem(8),

  position: 'absolute',
  top: 0,
  right: toRem(-8),
  zIndex: 1,
});

export const Username = style({
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  selectors: {
    'button&': {
      cursor: 'pointer',
    },
    'button&:hover, button&:focus-visible': {
      textDecoration: 'underline',
    },
  },
});

export const UsernameBold = style({
  fontWeight: 550,
});

export const PronounPill = style({
  borderRadius: config.radii.Pill,
  backgroundColor: 'var(--sable-surface-var-container)',
  paddingInline: toRem(5),
  opacity: 0.8,
  fontSize: '0.7rem',
  whiteSpace: 'nowrap',
  textTransform: 'lowercase',
});

export const MessageTextBody = recipe({
  base: {
    wordBreak: 'break-word',
    fontSize: '1rem !important', // Override folds Text component to enable page zoom scaling
  },
  variants: {
    preWrap: {
      true: {
        whiteSpace: 'pre-wrap',
      },
    },
    jumboEmoji: {
      none: {
        fontSize: '1rem !important',
        lineHeight: 'inherit',
      },
      extraSmall: {
        fontSize: '1.25rem !important',
        lineHeight: '1.4em',
      },
      small: {
        fontSize: '1.5rem !important',
        lineHeight: '1.5em',
      },
      normal: {
        fontSize: '1.805rem !important',
        lineHeight: '1.625em',
      },
      large: {
        fontSize: '2.1rem !important',
        lineHeight: '1.675em',
      },
      extraLarge: {
        fontSize: '2.4rem !important',
        lineHeight: '1.7em',
      },
    },
    emote: {
      true: {
        color: color.Success.Main,
        fontStyle: 'italic',
      },
    },
  },
});

export type MessageTextBodyVariants = RecipeVariants<typeof MessageTextBody>;
