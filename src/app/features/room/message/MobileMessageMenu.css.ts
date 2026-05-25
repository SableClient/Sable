import { keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const slideUp = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
});

export const Backdrop = style({
  position: 'fixed',
  inset: 0,
  // Theme-scrim overlay dims the timeline behind the sheet, just like Discord does.
  background: color.Other.Overlay,
  zIndex: 100,
});

export const Sheet = style([
  DefaultReset,
  {
    position: 'fixed',
    bottom: 'calc(100vh - var(--sable-visible-height, 100vh))',
    left: 0,
    right: 0,
    zIndex: 101,
    background: color.Surface.Container,
    borderRadius: `${toRem(16)} ${toRem(16)} 0 0`,
    paddingBottom: `max(${config.space.S400}, env(safe-area-inset-bottom))`,
    boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
    animation: `${slideUp} 220ms cubic-bezier(0.4, 0, 0.2, 1)`,
    maxHeight: '80vh',
    overflowY: 'auto',
  },
]);

export const Handle = style({
  width: toRem(36),
  height: toRem(4),
  background: color.SurfaceVariant.ContainerLine,
  borderRadius: toRem(2),
  margin: `${config.space.S200} auto ${config.space.S100}`,
});

export const ReactionsRow = style({
  display: 'flex',
  gap: config.space.S200,
  padding: `${config.space.S300} ${config.space.S400}`,
  justifyContent: 'center',
  flexWrap: 'wrap',
});

export const ReactionBtn = style({
  fontSize: toRem(28),
  lineHeight: 1,
  padding: config.space.S100,
  background: color.SurfaceVariant.Container,
  border: 'none',
  borderRadius: '50%',
  cursor: 'pointer',
  minWidth: toRem(48),
  minHeight: toRem(48),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  selectors: {
    '&:active': {
      background: color.SurfaceVariant.ContainerActive,
    },
  },
});

// A rounded-card group for visually separating action sections, like Discord.
export const ActionGroup = style({
  margin: `0 ${config.space.S300} ${config.space.S300}`,
  borderRadius: toRem(12),
  background: color.SurfaceVariant.Container,
  overflow: 'hidden',
});

export const ActionItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  padding: `${config.space.S300} ${config.space.S400}`,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  color: color.Surface.OnContainer,
  selectors: {
    // Separator between adjacent items inside a group
    '& + &': {
      borderTop: `1px solid ${color.SurfaceVariant.ContainerLine}`,
    },
    '&:active': {
      background: color.SurfaceVariant.ContainerActive,
    },
  },
});

export const ActionItemDanger = style({
  color: color.Critical.Main,
});

export const EmojiPickerHeader = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${config.space.S200} ${config.space.S300}`,
  borderBottom: `1px solid ${color.SurfaceVariant.ContainerLine}`,
});

export const EmojiPickerBackBtn = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(36),
  height: toRem(36),
  background: 'transparent',
  border: 'none',
  borderRadius: '50%',
  cursor: 'pointer',
  color: color.Surface.OnContainer,
  flexShrink: 0,
  selectors: {
    '&:active': {
      background: color.SurfaceVariant.ContainerActive,
    },
  },
});

export const EmojiPickerTitle = style({
  flexGrow: 1,
  textAlign: 'center',
  marginRight: toRem(36), // balance the back button width
});

export const EmojiPickerWrap = style({
  display: 'flex',
  justifyContent: 'center',
  padding: config.space.S200,
});

export const NickEditSection = style({
  padding: `${config.space.S300} ${config.space.S400}`,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
});

export const NickEditInput = style({
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `1px solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: toRem(6),
  padding: `${config.space.S100} ${config.space.S200}`,
  fontSize: toRem(14),
  width: '100%',
  outline: 'none',
  selectors: {
    '&:focus': {
      borderColor: color.Primary.Main,
    },
  },
});

export const NickEditActions = style({
  display: 'flex',
  gap: config.space.S200,
});
