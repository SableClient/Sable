import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const PollEvent = style({
  backgroundColor: color.Background.Container,
  maxWidth: toRem(500),
  borderRadius: config.radii.R500,
  padding: config.space.S200,
  textAlign: 'justify',
});

export const PollHeader = style({
  color: color.Primary.Main,
});

export const PollEventSeparator = style({
  width: '99%',
  alignSelf: 'Center',
});

export const PollAnswerCount = style({
  color: color.SurfaceVariant.OnContainer,
  paddingLeft: config.space.S100,
});
// These are only here for the potential modding of event by themes
export const PollAnswersBody = style({});
export const PollAnswerItem = style({});
export const PollAnswerBar = style({});
