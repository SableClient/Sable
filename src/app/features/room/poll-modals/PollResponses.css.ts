import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const ReactionViewer = style({
  height: '100%',
  width: '100%',
});

export const Sidebar = style({
  backgroundColor: color.Background.Container,
  color: color.Background.OnContainer,
  maxWidth: '50%',
});
export const SidebarContent = style({
  padding: config.space.S200,
  paddingRight: 0,
  height: '100%',
  width: '100%',
});

export const Header = style({
  paddingLeft: config.space.S400,
  paddingRight: config.space.S300,
  width: '100',
  flexShrink: 0,
  gap: config.space.S200,
});

export const Content = style({
  paddingLeft: config.space.S200,
  paddingBottom: config.space.S400,
});
