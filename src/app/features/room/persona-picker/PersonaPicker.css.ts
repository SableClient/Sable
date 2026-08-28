import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const PersonaPickerMenuItem = style({
  backgroundColor: color.Surface.Container,
  minWidth: toRem(200),
  padding: '0',
  selectors: {
    '&:hover': {
      backgroundColor: color.Surface.ContainerHover,
    },
    '&[aria-selected]': {
      backgroundColor: color.Surface.ContainerActive,
    },
  },
});

export const PersonaPickerButtonAvatar = style({
  border: 'solid',
  borderWidth: config.borderWidth.B400,
  borderColor: 'transparent',
});

export const SelectedPersonaPickerButtonAvatar = style({
  border: 'solid',
  borderWidth: config.borderWidth.B400,
  borderColor: color.SurfaceVariant.ContainerLine,
});

export const PersonaPickerButtonAvatarImage = style({
  borderRadius: 0,
});
