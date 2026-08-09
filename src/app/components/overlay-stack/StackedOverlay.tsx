// oxlint-disable no-restricted-imports -- this file is the wrappers the rule points at
import type { ComponentProps } from 'react';
import {
  Overlay as FoldsOverlay,
  PopOut as FoldsPopOut,
  TooltipProvider as FoldsTooltipProvider,
} from 'folds';
import { useOverlayLayer } from './OverlayStack';
import { OVERLAY_LAYER_TOP } from './layers';

type FoldsOverlayProps = ComponentProps<typeof FoldsOverlay>;
type FoldsPopOutProps = ComponentProps<typeof FoldsPopOut>;
type FoldsTooltipProviderProps = ComponentProps<typeof FoldsTooltipProvider>;

// Folds paints every overlay on one shared layer, leaving portal order to decide
// which of two overlapping ones wins. These take a layer from the overlay stack.
export function Overlay({ style, ...props }: FoldsOverlayProps) {
  const zIndex = useOverlayLayer(!!props.open);

  return <FoldsOverlay {...props} style={{ zIndex, ...style }} />;
}

export function PopOut({ style, ...props }: FoldsPopOutProps) {
  const zIndex = useOverlayLayer(!!props.anchor);

  return <FoldsPopOut {...props} style={{ zIndex, ...style }} />;
}

// A trigger stays mounted whether or not its tooltip is showing, so claiming a
// layer per trigger would flood the stack. Tooltips ride above it instead.
export function TooltipProvider({ style, ...props }: FoldsTooltipProviderProps) {
  return <FoldsTooltipProvider {...props} style={{ zIndex: OVERLAY_LAYER_TOP, ...style }} />;
}
