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
  alignSelf: 'center',
});

export const PollAnswersBody = style({});

export const PollAnswerItem = style({});

export const PollAnswerBar = style({});

export const RadioZone = style({
  display: 'flex',
  alignItems: 'center',
  padding: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
  selectors: {
    '&:disabled': {
      cursor: 'default',
    },
  },
});

export const AnswerTextButton = style({
  display: 'flex',
  alignItems: 'center',
  flexGrow: 1,
  minWidth: 0,
  padding: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  color: color.Surface.OnContainer,
  selectors: {
    '&:disabled': {
      cursor: 'default',
    },
  },
});

export const PollAnswerCount = style({
  color: color.SurfaceVariant.OnContainer,
  paddingLeft: config.space.S100,
  flexShrink: 0,
});

export const AnswerCountButton = style([
  PollAnswerCount,
  {
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
]);

export const ShowResultsButton = style({
  padding: 0,
  background: 'none',
  border: 'none',
  color: color.Primary.Main,
  cursor: 'pointer',
  textAlign: 'left',
});

export const PollFooter = style({
  flexWrap: 'wrap',
});

export const PollFooterMeta = style({
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
});
