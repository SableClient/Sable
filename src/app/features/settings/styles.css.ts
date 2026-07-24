import { style } from '@vanilla-extract/css';
import { config } from 'folds';
import { messageJumpHighlight } from '$components/message/layout/layout.css';

export const SequenceCardStyle = style({
  padding: config.space.S300,
});

export const focusedSettingTile = messageJumpHighlight;
