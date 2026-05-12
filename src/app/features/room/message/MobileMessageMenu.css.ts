import { keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, config, toRem } from 'folds';

const slideUp = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
});

export const Backdrop = style({
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.88)',
  zIndex: 100,
});

export const Sheet = style([
  DefaultReset,
  {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 101,
    background: 'var(--mx-c-surface)',
    borderRadius: `${toRem(16)} ${toRem(16)} 0 0`,
    paddingBottom: `max(${config.space.S400}, env(safe-area-inset-bottom))`,
    boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
    animation: `${slideUp} 220ms cubic-bezier(0.4, 0, 0.2, 1)`,
    maxHeight: '80dvh',
    overflowY: 'auto',
  },
]);

export const Handle = style({
  width: toRem(36),
  height: toRem(4),
  background: 'var(--mx-c-outline-variant)',
  borderRadius: toRem(2),
  margin: `${config.space.S200} auto ${config.space.S100}`,
});

export const ReactionsRow = style({
  display: 'flex',
  gap: config.space.S200,
  padding: `${config.space.S200} ${config.space.S400}`,
  justifyContent: 'center',
  flexWrap: 'wrap',
});

export const ReactionBtn = style({
  fontSize: toRem(28),
  lineHeight: 1,
  padding: config.space.S100,
  background: 'none',
  border: 'none',
  borderRadius: toRem(8),
  cursor: 'pointer',
  minWidth: toRem(48),
  minHeight: toRem(48),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  selectors: {
    '&:active': {
      background: 'var(--mx-c-surface-variant)',
    },
  },
});

export const ActionList = style({
  display: 'flex',
  flexDirection: 'column',
  padding: `0 ${config.space.S200} ${config.space.S200}`,
});

export const ActionItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  padding: `${config.space.S300} ${config.space.S300}`,
  borderRadius: toRem(8),
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  color: 'var(--mx-c-on-surface)',
  selectors: {
    '&:active': {
      background: 'var(--mx-c-surface-variant)',
    },
  },
});

export const ActionItemDanger = style({
  color: 'var(--mx-c-error)',
});
