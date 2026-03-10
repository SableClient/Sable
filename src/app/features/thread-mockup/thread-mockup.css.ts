import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const MockupPage = style({
  height: '100%',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});

export const VariantBar = style({
  padding: `${config.space.S100} ${config.space.S300}`,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
  borderBottomWidth: config.borderWidth.B300,
  borderBottomStyle: 'solid',
});

export const ContentArea = style({
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  position: 'relative',
});

export const Timeline = style({
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});

export const TimelineScroll = style({
  flex: 1,
  overflow: 'hidden',
});

export const MessageRow = style({
  padding: `${config.space.S100} ${config.space.S400}`,
  display: 'flex',
  gap: config.space.S300,
  borderRadius: config.radii.R300,
  transition: 'background 80ms',
  selectors: {
    '&:hover': {
      backgroundColor: 'var(--mx-bg-surface-hover)',
    },
    '&[data-active="true"]': {
      backgroundColor: 'var(--mx-bg-surface-active)',
    },
  },
});

export const ThreadChipRow = style({
  paddingLeft: toRem(80),
  paddingBottom: config.space.S100,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
});

export const InlineThreadContainer = style({
  marginLeft: toRem(80),
  marginRight: config.space.S400,
  marginBottom: config.space.S200,
  paddingLeft: config.space.S300,
  borderRadius: config.radii.R300,
  borderLeftWidth: '2px',
  borderLeftStyle: 'solid',
  overflow: 'hidden',
});

export const InlineReplyRow = style({
  padding: `${config.space.S100} 0`,
  display: 'flex',
  gap: config.space.S200,
});

export const ThreadPanel = style({
  width: toRem(340),
  flexShrink: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  borderLeftWidth: config.borderWidth.B300,
  borderLeftStyle: 'solid',
});

export const ThreadPanelHeader = style({
  padding: `0 ${config.space.S200} 0 ${config.space.S300}`,
  flexShrink: 0,
  borderBottomWidth: config.borderWidth.B300,
  borderBottomStyle: 'solid',
});

export const ThreadPanelScroll = style({
  flex: 1,
  overflow: 'hidden',
});

export const ThreadRootMsg = style({
  padding: config.space.S300,
  marginBottom: config.space.S100,
  borderBottomWidth: config.borderWidth.B300,
  borderBottomStyle: 'solid',
});

export const InputArea = style({
  padding: `${config.space.S200} ${config.space.S300}`,
  flexShrink: 0,
  borderTopWidth: config.borderWidth.B300,
  borderTopStyle: 'solid',
});

export const MockInput = style({
  padding: `${config.space.S200} ${config.space.S300}`,
  borderRadius: config.radii.R300,
  borderWidth: config.borderWidth.B300,
  borderStyle: 'solid',
  flex: 1,
  display: 'flex',
  alignItems: 'center',
});

export const OverlayBackdrop = style({
  position: 'absolute',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.45)',
  zIndex: 10,
  display: 'flex',
  justifyContent: 'flex-end',
});

export const OverlayPanel = style({
  width: toRem(400),
  maxWidth: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

export const AvatarCircle = style({
  width: toRem(36),
  height: toRem(36),
  borderRadius: '50%',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: toRem(15),
  color: 'white',
  userSelect: 'none',
});

export const SmallAvatarCircle = style({
  width: toRem(24),
  height: toRem(24),
  borderRadius: '50%',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 600,
  fontSize: toRem(11),
  color: 'white',
  userSelect: 'none',
});

export const ParticipantAvatars = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(-4),
});

export const NewBadge = style({
  padding: `0 ${config.space.S100}`,
  borderRadius: config.radii.R300,
  fontSize: toRem(10),
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'white',
  backgroundColor: 'var(--mx-tc-primary)',
  flexShrink: 0,
});
