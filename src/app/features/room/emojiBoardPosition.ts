const EMOJI_BOARD_MAX_WIDTH = 432;
const EMOJI_BOARD_VIEWPORT_GUTTER = 32;

export const getEmojiBoardWidth = (viewportWidth: number): number =>
  Math.min(EMOJI_BOARD_MAX_WIDTH, Math.max(0, viewportWidth - EMOJI_BOARD_VIEWPORT_GUTTER));

export const getEmojiBoardRightOffset = (anchorRight: number, viewportWidth: number): number => {
  const boardWidth = getEmojiBoardWidth(viewportWidth);
  const availableSlack = Math.max(0, viewportWidth - boardWidth);

  // On narrow viewports the responsive picker already fills the screen minus a
  // fixed gutter, so centering it preserves even left/right spacing.
  if (boardWidth < EMOJI_BOARD_MAX_WIDTH) {
    return availableSlack / 2;
  }

  const rawRight = viewportWidth - anchorRight;
  return Math.max(0, Math.min(rawRight, availableSlack));
};
