import { style } from '@vanilla-extract/css';
import { config, color } from 'folds';

export const ForumHeroTopic = style({
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',

  ':hover': {
    cursor: 'pointer',
    opacity: config.opacity.P500,
    textDecoration: 'underline',
  },
});

export const Header = style({
  borderBottomColor: 'transparent',
});

export const ForumThreadItem = style({
  paddingBottom: config.space.S200,
  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
  cursor: 'pointer',
});
