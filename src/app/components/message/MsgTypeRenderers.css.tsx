import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const ReplyBend = style({
  flexShrink: 0,
});

export const LocationRendererBody = style({
  maxWidth: toRem(500),
  backgroundColor: color.SurfaceVariant.Container,
  borderRadius: config.radii.R500,
  overflow: 'hidden',
});

export const LocationRendererHeader = style({ padding: config.space.S200 });

export const LocationCoordsChip = style({});
export const LocationExternalChip = style({ flexShrink: '0' });

export const LocationMapContainer = style({ height: toRem(400) });
